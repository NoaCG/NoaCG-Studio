// A STRANGER'S OGRAF PACKAGE AS A LIBRARY ENTRY (docs/work-specs/playout-ograf-rundown/spec.md,
// E3.1): the record that says which package a graphic IS, kept apart from everything else a
// production names.
//
//   - THE PACKAGE'S IDENTITY is its manifest `id` and `version` plus a `revision`: the sha256 of
//     its file list, each path with its own sha256 and size. Two imports of the same bytes have the
//     same revision whatever the library entry, pool copy or cue that carries them; one changed
//     byte anywhere is another revision. It is never the library entry's id (`GraphicDoc.id`), a
//     pool graphic's id (`SavedGraphic.id`), a cue's id or a cue's typed data (`ShowCue.typed`).
//   - THE BYTES are the package's own, untouched, as the template's assets under their package
//     paths (the manifest's bytes among them, so a vendor block nobody here reads survives byte for
//     byte). Nothing is split into the editor's panes, so no native scene is made from them.
//   - THE INTEGRITY CHECK (`verifyForeignPackage`) hashes the bytes again and compares them with the
//     record before anything may load them; a package whose bytes changed is refused with the path.
//
// The record rides on `SpxTemplate.foreign` with its own `v` (additive optional): an older build
// keeps it untouched, and this build reads a later `v` as read-only (`readForeignPackage`).
//
// Pure (model layer): no DOM and no zip. The archive is read in export/targets/ografForeign.ts.
// Runtime imports carry `.ts`, so Node loads it beside control/takeBlockers.ts with no resolver
// (and it decodes its own data URLs for the same reason: assets/assetUtils.ts does not).

import type { AssetFile, SpxTemplate } from './types';
import { readOgrafDeclared } from './ografTyped.ts';
import { audioHash } from '../assets/audioHash.ts';

export const FOREIGN_PACKAGE_VERSION = 1;

/** One file of the package, by its path relative to the manifest's folder. */
export interface ForeignPackageFile {
  path: string;
  sha256: string;
  bytes: number;
}

export interface ForeignPackageRecord {
  v: typeof FOREIGN_PACKAGE_VERSION;
  /** The manifest's `id`: who the Graphic says it is. */
  id: string;
  /** The manifest's `version`, or null when it states none. */
  version: string | null;
  /** sha256 over the file list (`packageRevision`): which exact bytes these are. */
  revision: string;
  /** The manifest's path inside the package. */
  manifest: string;
  /** The manifest's `main`, inside the package. */
  main: string;
  files: ForeignPackageFile[];
}

export type ForeignPackageRead =
  | { status: 'absent' }
  | { status: 'ok'; record: ForeignPackageRecord }
  | { status: 'read-only'; reason: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const HEX64 = /^[0-9a-f]{64}$/;
const RECORD_KEYS = new Set(['v', 'id', 'version', 'revision', 'manifest', 'main', 'files']);

/** Whether a graphic is a stranger's package (whatever version its record is). */
export const isForeignGraphic = (template: Pick<SpxTemplate, 'foreign'> | null | undefined): boolean =>
  !!template && template.foreign !== undefined;

/** The record on a template, read: absent, readable, or one this build must not act on. */
export function readForeignPackage(template: Pick<SpxTemplate, 'foreign'>): ForeignPackageRead {
  const raw = template.foreign;
  if (raw === undefined) return { status: 'absent' };
  if (!isRecord(raw)) return { status: 'read-only', reason: 'its package record is unreadable' };
  if (typeof raw.v === 'number' && Number.isInteger(raw.v) && raw.v > FOREIGN_PACKAGE_VERSION) {
    return { status: 'read-only', reason: 'was imported by a later version of NoaCG' };
  }
  const files = raw.files;
  const ok =
    raw.v === FOREIGN_PACKAGE_VERSION &&
    Object.keys(raw).every((k) => RECORD_KEYS.has(k)) &&
    typeof raw.id === 'string' && raw.id.length > 0 &&
    (raw.version === null || typeof raw.version === 'string') &&
    typeof raw.revision === 'string' && HEX64.test(raw.revision) &&
    typeof raw.manifest === 'string' && typeof raw.main === 'string' &&
    Array.isArray(files) && files.length > 0 &&
    files.every((f) => isRecord(f) && typeof f.path === 'string' && typeof f.sha256 === 'string' && HEX64.test(f.sha256) && typeof f.bytes === 'number' && Number.isInteger(f.bytes) && f.bytes >= 0);
  if (!ok) return { status: 'read-only', reason: 'its package record is unreadable' };
  const paths = new Set((files as ForeignPackageFile[]).map((f) => f.path));
  if (paths.size !== files.length || !paths.has(raw.manifest as string) || !paths.has(raw.main as string)) {
    return { status: 'read-only', reason: 'its package record is unreadable' };
  }
  return { status: 'ok', record: raw as unknown as ForeignPackageRecord };
}

/** Why a cue over this graphic is not taken, as far as its package record goes: a record this
 *  build cannot act on (a later version's, or unreadable) keeps its package off air. Null for a
 *  native graphic and for a package this build reads. */
export function foreignTakeRefusal(template: Pick<SpxTemplate, 'foreign'>, name: string): string | null {
  const read = readForeignPackage(template);
  return read.status === 'read-only' ? foreignRefusal(name, read.reason) : null;
}

/** The words for a package this page will not act on: "Results board was imported by ...". */
export const foreignRefusal = (name: string, reason: string) => `${name} ${reason}, so it is kept as it is and does not load here.`;

/** The top-level fields a stranger's package declares, by the GDD `label` or JSON Schema `title`
 *  its author gave each: what the cue's typed form will offer. */
export function declaredFieldLabels(template: Pick<SpxTemplate, 'ograf'>): string[] {
  const read = readOgrafDeclared(template.ograf);
  if (read.status !== 'ok' || !read.fields?.properties) return [];
  const raw = (template.ograf?.manifest as { schema?: { properties?: Record<string, { label?: unknown }> } } | undefined)?.schema?.properties ?? {};
  return read.fields.properties.filter((p) => !p.node.hidden).map((p) => {
    const label = raw[p.key]?.label;
    return typeof label === 'string' && label ? label : p.node.title || p.key;
  });
}

/** The canvas and frame rate a stranger's package states (its first render requirement's ideals),
 *  or null when it does not state both: its format is then an assumed default. */
export function statedFormat(manifest: unknown): { width: number; height: number; fps: number } | null {
  const reqs = isRecord(manifest) ? manifest.renderRequirements : undefined;
  const first = Array.isArray(reqs) && isRecord(reqs[0]) ? reqs[0] : null;
  const ideal = (d: unknown, max: number, whole: boolean) =>
    isRecord(d) && typeof d.ideal === 'number' && Number.isFinite(d.ideal) && d.ideal > 0 && d.ideal <= max && (!whole || Number.isInteger(d.ideal)) ? d.ideal : null;
  const res = first && isRecord(first.resolution) ? first.resolution : null;
  const width = res ? ideal(res.width, 7680, true) : null;
  const height = res ? ideal(res.height, 7680, true) : null;
  const fps = first ? ideal(first.frameRate, 240, false) : null;
  return width && height && fps ? { width, height, fps } : null;
}

/** Whether a template's package states its own format (`statedFormat`). */
export const foreignFormatStated = (template: Pick<SpxTemplate, 'ograf'>): boolean => statedFormat(template.ograf?.manifest) !== null;

/** Why a foreign entry may not leave by an export target other than OGraf. */
export const foreignExportRefusal = (name: string) => `${name} is an imported OGraf package, so it exports only as OGraf.`;

/** Lowercase hex of a digest. */
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/** SHA-256 of the bytes, as lowercase hex. A page served over plain http on a LAN has no
 *  `crypto.subtle`; the same digest then comes from the dependency-free one the sound assets use. */
export async function sha256(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  return subtle ? hex(await subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)) : audioHash(bytes);
}

/** The package's revision: sha256 over its sorted file list, one `path\tsha256\tbytes\n` line each.
 *  A path may hold no tab or newline (the archive reader refuses them), so the lines cannot run
 *  into each other. */
export async function packageRevision(files: readonly ForeignPackageFile[]): Promise<string> {
  const lines = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map((f) => `${f.path}\t${f.sha256}\t${f.bytes}\n`);
  return sha256(new TextEncoder().encode(lines.join('')));
}

/** A data URL's or a Blob's bytes, as the template's assets hold them. */
export async function assetBytes(asset: AssetFile): Promise<Uint8Array | null> {
  const data = asset.data;
  if (typeof data !== 'string') return new Uint8Array(await data.arrayBuffer());
  const m = /^data:[^,]*?(;base64)?,/.exec(data);
  if (!m) return null;
  const body = data.slice(m[0].length);
  // Damaged text reads as no bytes, so the check names the file rather than throwing.
  try {
    if (!m[1]) return new TextEncoder().encode(decodeURIComponent(body));
    const bin = atob(body);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export type ForeignPackageCheck =
  | { ok: true; record: ForeignPackageRecord; files: Map<string, Uint8Array> }
  | { ok: false; reason: string };

/**
 * THE INTEGRITY CHECK, before anything loads a package: the record is readable, every file it lists
 * is among the template's assets with the same size and sha256, and the revision is the one those
 * files make. The bytes come back keyed by package path, for whoever serves them. One linear pass:
 * each file is hashed once.
 */
export async function verifyForeignPackage(template: Pick<SpxTemplate, 'foreign' | 'assets'>): Promise<ForeignPackageCheck> {
  const read = readForeignPackage(template);
  if (read.status === 'absent') return { ok: false, reason: 'it is not an imported OGraf package' };
  if (read.status === 'read-only') return { ok: false, reason: read.reason };
  const { record } = read;
  const byPath = new Map(template.assets.map((a) => [a.path, a] as const));
  // Decoded and hashed together, then judged in the record's order, so the first fault is named.
  const loaded = await Promise.all(record.files.map(async (f) => {
    const asset = byPath.get(f.path);
    const bytes = asset ? await assetBytes(asset) : null;
    return { bytes, hash: bytes ? await sha256(bytes) : null };
  }));
  const files = new Map<string, Uint8Array>();
  for (const [i, f] of record.files.entries()) {
    const { bytes, hash } = loaded[i];
    if (!bytes) return { ok: false, reason: `its file ${f.path} is missing or unreadable` };
    if (bytes.byteLength !== f.bytes || hash !== f.sha256) return { ok: false, reason: `its file ${f.path} has changed since it was imported` };
    files.set(f.path, bytes);
  }
  if ((await packageRevision(record.files)) !== record.revision) return { ok: false, reason: 'its file list has changed since it was imported' };
  return { ok: true, record, files };
}
