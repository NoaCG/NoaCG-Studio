// A STRANGER'S OGRAF PACKAGE IN, AND THE SAME BYTES OUT (docs/work-specs/playout-ograf-rundown/
// spec.md, E3.1).
//
// IN (`importForeignOgraf`): a zip somebody else made, read with every bound below BEFORE any of it
// is believed, then kept as a library entry that IS that package (model/foreignPackage.ts): the
// files untouched under their package paths, a record of who the Graphic is and which bytes these
// are, its manifest for E1's typed data, and empty panes. Nothing here runs the package's code.
//
//   - THE ARCHIVE (`readOgrafArchive`): its size, its entry count (read from the end record before
//     the zip library parses anything), each entry's name (no absolute path, drive, `..`, control
//     character, over-long name or duplicate), no link entry, and each file's and the whole
//     extraction's bytes counted AS THEY INFLATE, so a zip bomb stops at the limit however small
//     it is packed. Zip64 is refused: no package needs it.
//   - THE PACKAGE (`readForeignFiles`): the manifest conformant (ografSchema.ts, the exporter's own
//     gate), its `main` a module inside the package, and every file reference the package states
//     where it can be read without running it (manifest paths, static module imports,
//     `new URL(..., import.meta.url)`, CSS `url()` and `@import`) resolving inside the package to
//     a file it contains. A reference that leaves the package or names nothing is refused with its
//     file and its words.
//
// Every refusal is one precise sentence; nothing half-imports.
//
// OUT (`foreignPackageZip`): the record's files, verified against their hashes first, under one
// folder: an export and a re-import give the same revision.

import JSZip from 'jszip';
import { DECLARED_VERSION, readOgrafDeclared, type OgrafDeclared } from '../../model/ografTyped';
import {
  FOREIGN_PACKAGE_VERSION,
  packageRevision,
  sha256,
  verifyForeignPackage,
  type ForeignPackageFile,
  type ForeignPackageRecord,
} from '../../model/foreignPackage';
import { DEFAULT_GRAPHICS_FORMAT, projectFormatForResolution, resolutionForSelection } from '../../model/projectFormat';
import { DEFAULT_SETTINGS, type AssetFile, type Resolution, type SpxTemplate } from '../../model/types';
import { findManifestPath, readNoacgVendorBlock } from './ografImport';
import { slug } from '../../model/slug';
import { validateOgrafManifest, validateOgrafPackage } from './ografSchema';

/** THE BOUNDS. Each is pinned at its edge by scripts/ograf-foreign.test.mjs. */
export const OGRAF_ARCHIVE_LIMITS = {
  /** The zip itself. */
  archiveBytes: 32 * 1024 * 1024,
  /** Entries in its central directory, folders included. */
  entries: 1000,
  /** One file, inflated. */
  fileBytes: 16 * 1024 * 1024,
  /** All files together, inflated. */
  totalBytes: 48 * 1024 * 1024,
  /** One entry name, in UTF-16 code units. */
  pathLength: 240,
  /** Folders deep. */
  pathDepth: 16,
  /** References read in one text file; past this the file is refused rather than skimmed. */
  referencesPerFile: 2000,
} as const;

export type ArchiveRead = { ok: true; files: Map<string, Uint8Array> } | { ok: false; reason: string };

const MB = (n: number) => `${Math.round(n / (1024 * 1024))} MB`;

/** The archive's own entry names, read from its central directory before the zip library parses
 *  anything (it cleans `../` out of names and lets a later entry replace an earlier one of the same
 *  cleaned name, so neither can be judged after it), or a refusal. At most `entries` are read. */
function centralNames(bytes: Uint8Array): string[] | string {
  // The end record is 22 bytes plus a comment of at most 65535; it is searched for from the end.
  const floor = Math.max(0, bytes.length - 22 - 0xffff);
  let end = -1;
  for (let i = bytes.length - 22; i >= floor; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      end = i;
      break;
    }
  }
  if (end < 0) return 'It is not a readable zip archive.';
  const u16 = (at: number) => bytes[at] | (bytes[at + 1] << 8);
  const u32 = (at: number) => (u16(at) | (u16(at + 2) << 16)) >>> 0;
  const total = u16(end + 10);
  if (total === 0xffff || u32(end + 16) === 0xffffffff) return 'It is a Zip64 archive, which a graphic package never needs.';
  if (total > OGRAF_ARCHIVE_LIMITS.entries) return `The archive has ${total} entries; a package may have at most ${OGRAF_ARCHIVE_LIMITS.entries}.`;
  const names: string[] = [];
  // Decoded as JSZip decodes them (UTF-8), so the names judged here are the names it keys by; a
  // name it would read otherwise (a Unicode-path field, a local header that disagrees) is caught
  // after it parses, by comparing the two lists.
  const utf8 = new TextDecoder('utf-8');
  let at = u32(end + 16);
  // Walked as JSZip walks it, while the signature holds, not as far as the end record claims: a
  // record that understates the directory must not let the rest through unread.
  while (at + 46 <= bytes.length && u32(at) === 0x02014b50) {
    if (names.length === OGRAF_ARCHIVE_LIMITS.entries) return `The archive has more than ${OGRAF_ARCHIVE_LIMITS.entries} entries; a package may have at most ${OGRAF_ARCHIVE_LIMITS.entries}.`;
    const nameLength = u16(at + 28);
    names.push(utf8.decode(bytes.subarray(at + 46, at + 46 + nameLength)));
    at += 46 + nameLength + u16(at + 30) + u16(at + 32);
  }
  if (names.length !== total) return 'Its central directory does not match its end record.';
  return names;
}

/** Why an entry name may not be extracted, or null. Backslashes are read as separators, as the
 *  native importer reads them (model/importTemplate.ts). */
export function entryNameRefusal(raw: string): string | null {
  const name = raw.replace(/\\/g, '/');
  if (name.length > OGRAF_ARCHIVE_LIMITS.pathLength) return `The entry "${name.slice(0, 60)}…" has a name longer than ${OGRAF_ARCHIVE_LIMITS.pathLength} characters.`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return `An entry name holds a control character (${JSON.stringify(name.slice(0, 60))}).`;
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return `The entry "${name}" is an absolute path.`;
  const parts = name.replace(/\/$/, '').split('/');
  if (parts.some((p) => p === '..')) return `The entry "${name}" climbs out of the archive with "..".`;
  if (parts.some((p) => p === '' || p === '.')) return `The entry "${name}" has an empty or "." folder in its path.`;
  if (parts.length > OGRAF_ARCHIVE_LIMITS.pathDepth) return `The entry "${name}" is more than ${OGRAF_ARCHIVE_LIMITS.pathDepth} folders deep.`;
  return null;
}

/** One entry's bytes, counted as they inflate: past `room` it stops and says so. */
function inflateBounded(entry: JSZip.JSZipObject, room: number): Promise<Uint8Array | 'file' | 'total'> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    let done = false;
    // `internalStream` is JSZip's chunked reader (it is in its typings as of 3.x).
    const stream = (entry as unknown as { internalStream(type: 'uint8array'): JSZipStream }).internalStream('uint8array');
    const stop = (out: Uint8Array | 'file' | 'total') => {
      if (done) return;
      done = true;
      stream.pause();
      resolve(out);
    };
    stream
      .on('data', (chunk: Uint8Array) => {
        if (done) return;
        size += chunk.byteLength;
        if (size > OGRAF_ARCHIVE_LIMITS.fileBytes) return stop('file');
        if (size > room) return stop('total');
        chunks.push(chunk);
      })
      .on('error', (err: unknown) => {
        if (!done) {
          done = true;
          reject(err);
        }
      })
      .on('end', () => {
        if (done) return;
        const out = new Uint8Array(size);
        let at = 0;
        for (const c of chunks) {
          out.set(c, at);
          at += c.byteLength;
        }
        stop(out);
      })
      .resume();
  });
}

interface JSZipStream {
  on(event: 'data', cb: (chunk: Uint8Array) => void): JSZipStream;
  on(event: 'error', cb: (err: unknown) => void): JSZipStream;
  on(event: 'end', cb: () => void): JSZipStream;
  resume(): JSZipStream;
  pause(): JSZipStream;
}

/** S_IFLNK in the high half of a unix-made entry's external attributes. */
const isLink = (entry: JSZip.JSZipObject) => {
  const mode = entry.unixPermissions;
  return typeof mode === 'number' && (mode & 0o170000) === 0o120000;
};

/** Read a zip into a file map (POSIX paths), refusing it whole on the first bound it breaks. */
export async function readOgrafArchive(data: ArrayBuffer | Uint8Array): Promise<ArchiveRead> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength > OGRAF_ARCHIVE_LIMITS.archiveBytes) return { ok: false, reason: `The archive is larger than ${MB(OGRAF_ARCHIVE_LIMITS.archiveBytes)}.` };
  const names = centralNames(bytes);
  if (typeof names === 'string') return { ok: false, reason: names };
  const seen = new Set<string>();
  for (const raw of names) {
    const refusal = entryNameRefusal(raw);
    if (refusal) return { ok: false, reason: refusal };
    const name = raw.replace(/\\/g, '/');
    // Two entries that differ only in case are one file on most disks a package is unpacked to.
    const key = name.replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) return { ok: false, reason: `The entry "${name}" is in the archive twice.` };
    seen.add(key);
  }
  let zip: JSZip;
  try {
    // No CRC check here: it would inflate every entry in full before any bound below could stop
    // a bomb. Every kept file is hashed instead (model/foreignPackage.ts).
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    return { ok: false, reason: `It is not a readable zip archive (${e instanceof Error ? e.message : String(e)}).` };
  }
  const entries = Object.values(zip.files);
  // JSZip keys files by the LOCAL header's name (or a Unicode-path field), which can differ from
  // the central one judged above: every file it holds must be one of those, by the same words.
  const judged = new Set(names.filter((n) => !n.endsWith('/')));
  const held = entries.filter((e) => !e.dir).map((e) => (e as { unsafeOriginalName?: string }).unsafeOriginalName ?? e.name);
  if (held.length !== judged.size || held.some((n) => !judged.has(n))) return { ok: false, reason: 'Its local and central entry names disagree.' };
  const files = new Map<string, Uint8Array>();
  let total = 0;
  for (const entry of entries) {
    const name = entry.name.replace(/\\/g, '/');
    if (isLink(entry)) return { ok: false, reason: `The entry "${name}" is a link, which a package may not hold.` };
    if (entry.dir) continue;
    // macOS's resource forks are the archiver's, never the package's.
    if (name.startsWith('__MACOSX/')) continue;
    let out: Uint8Array | 'file' | 'total';
    try {
      out = await inflateBounded(entry, OGRAF_ARCHIVE_LIMITS.totalBytes - total);
    } catch (e) {
      return { ok: false, reason: `The entry "${name}" cannot be read (${e instanceof Error ? e.message : String(e)}).` };
    }
    if (out === 'file') return { ok: false, reason: `The file "${name}" is larger than ${MB(OGRAF_ARCHIVE_LIMITS.fileBytes)} unpacked.` };
    if (out === 'total') return { ok: false, reason: `The archive unpacks to more than ${MB(OGRAF_ARCHIVE_LIMITS.totalBytes)}.` };
    total += out.byteLength;
    files.set(name, out);
  }
  return { ok: true, files };
}

const decoder = new TextDecoder();
const isRecordValue = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Whether a file map is a STRANGER'S Graphic: a manifest that is not a NoaCG dual package's, whose
 *  `main` the package contains or beside no html page at all. Anything else (no manifest, ours, or
 *  an html page with a manifest beside it, E1's case) is the native importer's. */
export function isForeignOgraf(files: ReadonlyMap<string, Uint8Array>): boolean {
  const manifestPath = findManifestPath(files.keys());
  if (!manifestPath) return false;
  let manifest: unknown;
  try {
    manifest = JSON.parse(decoder.decode(files.get(manifestPath)));
  } catch {
    // A manifest that does not parse beside no page is a broken stranger's package: refused here
    // with the reason, rather than read as an html zip with no html.
    return ![...files.keys()].some((p) => p.toLowerCase().endsWith('.html'));
  }
  if (!isRecordValue(manifest)) return false;
  if (readNoacgVendorBlock(manifest)?.source) return false;
  const dir = manifestPath.slice(0, manifestPath.lastIndexOf('/') + 1);
  if (typeof manifest.main === 'string' && files.has(dir + manifest.main.replace(/^\.\//, ''))) return true;
  // With no page to fall back on, a broken stranger's package is still one: refused here with its
  // reason, not as "no .html file".
  return ![...files.keys()].some((p) => p.toLowerCase().endsWith('.html'));
}

/** Where `ref`, found in the package file `from`, points inside the package: its path, null for a
 *  reference the host resolves (another scheme), or 'out' when it leaves the package. A package
 *  root of `https://package.invalid/p/` stands for wherever it is served from; the URL parser does
 *  the dot segments and their percent-encoded forms as a browser would. */
function resolveRef(from: string, ref: string): string | null | 'out' {
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) return null;
  if (ref.startsWith('#')) return null;
  // Root-absolute and scheme-relative references resolve against the host, never the package.
  if (ref.startsWith('/') || ref.startsWith('\\')) return 'out';
  let url: URL;
  try {
    // The file's own path, encoded, so a `#`, `?` or `%` in a folder name stays part of it.
    url = new URL(ref, `https://package.invalid/p/${from.split('/').map(encodeURIComponent).join('/')}`);
  } catch {
    return 'out';
  }
  if (url.origin !== 'https://package.invalid' || !url.pathname.startsWith('/p/')) return 'out';
  try {
    return url.pathname.slice(3).split('/').map(decodeURIComponent).join('/');
  } catch {
    return 'out';
  }
}

const MODULE_EXT = /\.(m?js)$/i;
const STYLE_EXT = /\.css$/i;

/** The text without its comments, in one pass. Quoted strings are kept whole, so a `//` inside a
 *  URL string is not a comment. A regex literal is not recognised, which can hide a reference. */
export function withoutComments(text: string): string {
  let out = '';
  let from = 0;
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote || (c === '\n' && quote !== '`')) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
    if (c !== '/' || (text[i + 1] !== '/' && text[i + 1] !== '*')) continue;
    out += text.slice(from, i);
    const end = text[i + 1] === '/' ? text.indexOf('\n', i + 2) : text.indexOf('*/', i + 2);
    if (end < 0) return out;
    i = text[i + 1] === '/' ? end - 1 : end + 1;
    from = i + 1;
  }
  return out + text.slice(from);
}

// Every quantifier between two literals is bounded, so no pattern backtracks past a few hundred
// characters at any position: scanning stays linear in the file's size (measured in the test).
// A static import is read only where a statement starts, so prose about one inside a string is
// not taken for one; one written at the start of a line inside a template literal still would be,
// and is then refused by its words, which say which file and which reference.
const IMPORT_FROM = /(?:^|[;}\n])\s{0,40}(?:import|export)\s{0,40}(?:[\w*{}\s,$]{1,400}?\sfrom\s{0,40})?(["'])([^"'\n]{1,500})\1/g;
const IMPORT_CALL = /(?<![\w$.'"`])import\(\s{0,40}(["'])([^"'\n]{1,500})\1\s{0,40}\)/g;
const META_URL = /\bnew\s{1,40}URL\(\s{0,40}(["'`])([^"'`\n]{1,500})\1\s{0,40},\s{0,40}import\.meta\.url\s{0,40}\)/g;
const CSS_URL = /url\(\s{0,40}(["']?)([^"')\n]{1,500})\1\s{0,40}\)/g;
const CSS_IMPORT = /@import\s{1,40}(["'])([^"'\n]{1,500})\1/g;

/** A reference a file states. `strict`: a static import or a stylesheet's, which must name a file
 *  the package holds; a dynamic `import()` or `new URL()` may sit on a path that never runs (or in
 *  prose this reader cannot tell from code), so only leaving the package refuses it. */
interface StatedRef {
  ref: string;
  strict: boolean;
}

/** The references a text file states where they can be read without running it, up to `max` (one
 *  more than that says there are too many). Comments are dropped first. */
function referencesIn(path: string, text: string, max: number): StatedRef[] {
  const out: StatedRef[] = [];
  const code = withoutComments(text);
  const patterns: Array<[RegExp, boolean]> = MODULE_EXT.test(path)
    ? [[IMPORT_FROM, true], [IMPORT_CALL, false], [META_URL, false]]
    : STYLE_EXT.test(path) ? [[CSS_URL, true], [CSS_IMPORT, true]] : [];
  for (const [re, strict] of patterns) {
    for (const m of code.matchAll(re)) {
      out.push({ ref: m[2], strict });
      if (out.length > max) return out;
    }
  }
  return out;
}

export type ForeignRead = { ok: true; template: SpxTemplate; record: ForeignPackageRecord } | { ok: false; reason: string };

const MIME: Record<string, string> = {
  mjs: 'text/javascript', js: 'text/javascript', json: 'application/json', css: 'text/css', html: 'text/html',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm',
  txt: 'text/plain', md: 'text/markdown',
};
export const mimeOf = (path: string) => MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

function base64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The package's canvas: its first render requirement's ideal size, or null when it states none. */
function resolutionOf(manifest: Record<string, unknown>): Resolution | null {
  const first = Array.isArray(manifest.renderRequirements) ? manifest.renderRequirements[0] : undefined;
  const res = isRecordValue(first) && isRecordValue(first.resolution) ? first.resolution : null;
  const ideal = (d: unknown) => (isRecordValue(d) && typeof d.ideal === 'number' && Number.isInteger(d.ideal) && d.ideal > 0 && d.ideal <= 7680 ? d.ideal : null);
  const width = res ? ideal(res.width) : null;
  const height = res ? ideal(res.height) : null;
  if (!width || !height) return null;
  const preset = projectFormatForResolution({ width, height });
  return preset ? { width: preset.width, height: preset.height, label: preset.label } : { width, height, label: `Imported (${width}×${height})` };
}

/** The package's frame rate: its first render requirement's ideal, else 50 (said as assumed). */
function frameRateOf(manifest: Record<string, unknown>): number {
  const first = Array.isArray(manifest.renderRequirements) ? manifest.renderRequirements[0] : undefined;
  const rate = isRecordValue(first) && isRecordValue(first.frameRate) ? first.frameRate.ideal : undefined;
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 && rate <= 240 ? rate : 50;
}

/** A file map that `isForeignOgraf` admitted, read into the library entry, or refused. */
export async function readForeignFiles(fileName: string, files: ReadonlyMap<string, Uint8Array>): Promise<ForeignRead> {
  const manifestPath = findManifestPath(files.keys());
  if (!manifestPath) return { ok: false, reason: 'There is no .ograf.json manifest in it.' };
  const dir = manifestPath.slice(0, manifestPath.lastIndexOf('/') + 1);
  const pkg = new Map<string, Uint8Array>();
  for (const [p, bytes] of files) if (p.startsWith(dir)) pkg.set(p.slice(dir.length), bytes);
  const manifestName = manifestPath.slice(dir.length);

  let manifest: unknown;
  try {
    manifest = JSON.parse(decoder.decode(pkg.get(manifestName)));
  } catch (e) {
    return { ok: false, reason: `${manifestName} is not readable JSON (${e instanceof Error ? e.message : String(e)}).` };
  }
  if (!isRecordValue(manifest)) return { ok: false, reason: `${manifestName} is not a JSON object.` };
  const errors = [...validateOgrafManifest(manifest, { elementId: false }), ...validateOgrafPackage(manifest, [...pkg.keys()])];
  if (errors.length) return { ok: false, reason: `${manifestName} does not conform to OGraf v1: ${errors[0]}${errors.length > 1 ? ` (and ${errors.length - 1} more)` : ''}` };

  // `main` and the thumbnails, then what each module and stylesheet names.
  const stated: Array<{ from: string; ref: string; label: string; strict: boolean }> = [];
  stated.push({ from: manifestName, ref: String(manifest.main), label: 'main', strict: true });
  if (Array.isArray(manifest.thumbnails)) {
    manifest.thumbnails.forEach((t, i) => {
      if (isRecordValue(t) && typeof t.file === 'string') stated.push({ from: manifestName, ref: t.file, label: `thumbnails[${i}]`, strict: true });
    });
  }
  const main = resolveRef(manifestName, String(manifest.main));
  if (typeof main !== 'string' || !MODULE_EXT.test(main)) return { ok: false, reason: `Its main "${String(manifest.main)}" is not a module inside the package.` };
  for (const [path, bytes] of pkg) {
    if (!MODULE_EXT.test(path) && !STYLE_EXT.test(path)) continue;
    const refs = referencesIn(path, decoder.decode(bytes), OGRAF_ARCHIVE_LIMITS.referencesPerFile);
    if (refs.length > OGRAF_ARCHIVE_LIMITS.referencesPerFile) return { ok: false, reason: `${path} names more than ${OGRAF_ARCHIVE_LIMITS.referencesPerFile} files.` };
    for (const { ref, strict } of refs) stated.push({ from: path, ref, label: 'reference', strict });
  }
  for (const { from, ref, label, strict } of stated) {
    // A bare module specifier ("lodash") resolves through an import map no host provides here.
    if (label === 'reference' && strict && MODULE_EXT.test(from) && !/^(\.{1,2}\/|\/|[a-z][a-z0-9+.-]*:)/i.test(ref)) {
      return { ok: false, reason: `${from} imports "${ref}", which is not a path inside the package.` };
    }
    const to = resolveRef(from, ref);
    if (to === null) continue;
    if (to === 'out') return { ok: false, reason: `${from} refers to "${ref}", which is outside the package.` };
    if (strict && !pkg.has(to)) return { ok: false, reason: `${from} refers to "${ref}", which the package does not contain.` };
  }

  const list: ForeignPackageFile[] = [];
  const assets: AssetFile[] = [];
  for (const [path, bytes] of [...pkg].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    list.push({ path, sha256: await sha256(bytes), bytes: bytes.byteLength });
    assets.push({ path, data: `data:${mimeOf(path)};base64,${base64(bytes)}` });
  }
  const record: ForeignPackageRecord = {
    v: FOREIGN_PACKAGE_VERSION,
    id: String(manifest.id),
    version: typeof manifest.version === 'string' ? manifest.version : null,
    revision: await packageRevision(list),
    manifest: manifestName,
    main,
    files: list,
  };
  const declared: OgrafDeclared = { v: DECLARED_VERSION, manifest: manifest as OgrafDeclared['manifest'] };
  const name = typeof manifest.name === 'string' && manifest.name.trim() ? manifest.name.trim() : fileName.replace(/\.zip$/i, '') || record.id;
  const template: SpxTemplate = {
    name,
    type: 'blank',
    resolution: resolutionOf(manifest) ?? resolutionForSelection(DEFAULT_GRAPHICS_FORMAT),
    fps: frameRateOf(manifest),
    html: '',
    css: '',
    js: '',
    fields: [],
    settings: { ...DEFAULT_SETTINGS, description: name },
    assets,
    layers: [],
    // The manifest E1's typed data is made for, as it came. One past the typed reader's bounds is
    // not attached, as on the native importer's road: the package still imports, data-less.
    ...(readOgrafDeclared(declared).status === 'ok' ? { ograf: declared } : {}),
    foreign: record as unknown as SpxTemplate['foreign'],
  };
  return { ok: true, template, record };
}

/** A dropped zip: the stranger's package it holds, a refusal with its reason, or null when it is
 *  not a stranger's OGraf package at all (the native importer's to read). */
export async function importForeignOgraf(fileName: string, data: ArrayBuffer | Uint8Array): Promise<ForeignRead | null> {
  // No manifest named anywhere in the directory: not a package, and nothing is inflated to say so.
  const listed = centralNames(data instanceof Uint8Array ? data : new Uint8Array(data));
  if (Array.isArray(listed) && !listed.some((n) => n.toLowerCase().endsWith('.ograf.json'))) return null;
  const archive = await readOgrafArchive(data);
  if (!archive.ok) {
    // The bounds are this road's: a vendor's SPX pack of a thousand files, or one with a long
    // video, is still the native importer's to read as it always has. The refusal stands only for
    // what would have come this way, a manifest beside no page.
    const names = await JSZip.loadAsync(data).then((z) => Object.values(z.files).map((e) => (e as { unsafeOriginalName?: string }).unsafeOriginalName ?? e.name), () => [] as string[]);
    const ours = names.some((n) => n.toLowerCase().endsWith('.ograf.json')) && !names.some((n) => n.toLowerCase().endsWith('.html'));
    return ours ? { ok: false, reason: archive.reason } : null;
  }
  if (!isForeignOgraf(archive.files)) return null;
  return readForeignFiles(fileName, archive.files);
}

/** The package as it was imported, verified byte for byte first, under a folder named for its id. */
export async function foreignPackageZip(template: Pick<SpxTemplate, 'foreign' | 'assets' | 'name'>): Promise<JSZip> {
  const check = await verifyForeignPackage(template);
  if (!check.ok) throw new Error(`${template.name} cannot be exported: ${check.reason}.`);
  const zip = new JSZip();
  // Named like every other target's folder (`slug(name)`), so a production export's
  // collision-suffixed name keeps two copies of one package apart; never a dot-only name.
  const folder = slug(template.name) || 'package';
  for (const [path, bytes] of check.files) zip.file(`${folder}/${path}`, bytes, { binary: true });
  return zip;
}
