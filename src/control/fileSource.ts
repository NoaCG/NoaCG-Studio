// A LOCAL FILE AS A SOURCE (issue #2184): a CSV or Excel (.xlsx) file on the operator's computer,
// chosen in Chrome's file picker and re-read while the production page is open.
//
// It is one more kind of source to the Sheet reader (./sheetSource.ts), the way a news feed is
// (./feedSource.ts): the same 5-second cadence and 10-second timeout, the same lease, diff,
// stale rule and Pause, the same format adapters and the same write road through the operator's
// door with its limits. Only the read differs: instead of fetching a tab's CSV it asks the file
// handle for the file, and reads it again only when the file's lastModified (or size) moved, so
// an unchanged file costs a stat every 5 s and writes nothing.
//
// The handle itself cannot travel with the production (it is this browser's, for this computer),
// so it is kept in this browser's IndexedDB under the source's id (./fileHandles.ts), and the
// source record holds only the file's name, its format and the shape its rows take. Chrome asks
// for permission again after a reload: until the operator grants it with one click the read fails
// with FILE_PERMISSION, the values hold, and three misses mark the data stale. The link is never
// dropped.
//
// .xlsx is read here with JSZip, already a dependency for exports and imports: a workbook is a
// zip of XML parts, and the first sheet's cells, its shared strings and its date formats are all a
// broadcast list needs. No spreadsheet library is added.
//
// Pure and Node-importable: scripts/file-source.test.mjs drives it with fake handles and a fake
// clock.

import { detectSeparator, parseDelimited } from '../model/csv.js';
import { createSheetReader, type SheetRead, type SheetReader, type SheetReaderOptions } from './sheetSource.js';

/** The largest file read, as the server reads at most this much of a Sheet tab (api/_lib/dataTick.ts READ_BYTES). */
export const FILE_MAX_BYTES = 1_000_000;
/** The most text a workbook may unpack to: a small zip can hold a very large sheet. */
export const XLSX_MAX_CHARS = 20_000_000;

export type FileFormat = 'csv' | 'xlsx';

/** The formats the picker offers, by extension. */
export const FILE_PICKER_TYPES = [
  {
    description: 'CSV or Excel',
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
  },
];

/** A file's format from its name, or null when it is neither. */
export function fileFormatOf(name: string): FileFormat | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return ext === 'csv' || ext === 'tsv' ? 'csv' : ext === 'xlsx' ? 'xlsx' : null;
}

// ── The handle, as much of it as a read uses ──────────────────────────────────

export interface FileLike {
  name: string;
  size: number;
  lastModified: number;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

export interface FileHandleLike {
  name: string;
  getFile: () => Promise<FileLike>;
  queryPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
}

/** What the read says when this browser has the handle but Chrome wants permission again. The
 *  status line matches on it to offer the one-click Allow. */
export const FILE_PERMISSION = 'needs your permission to read it again';
/** What the read says when this browser has no handle for the source (another computer, or the
 *  browser's site data was cleared). The status line offers Choose the file. */
export const FILE_NOT_HERE = 'this computer has not chosen the file';

/** Whether a failing status needs the operator's click, and which. */
export function fileAsk(error: string | null | undefined): 'allow' | 'choose' | null {
  return error === FILE_PERMISSION ? 'allow' : error === FILE_NOT_HERE ? 'choose' : null;
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/** A CSV file's rows: a BOM dropped, and its separator found (a comma, or the semicolon European
 *  Excel writes, or a tab). Blank rows stay where they are, as in a Sheet's export. */
export function parseCsvFile(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return parseDelimited(src, detectSeparator(src));
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** XML text as the cell holds it: entities, and Excel's own `_x000D_` escapes. */
function xmlText(raw: string): string {
  return raw
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
      e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e] ?? m),
    )
    .replace(/_x([0-9a-f]{4})_/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\r\n?/g, '\n');
}

const attrs = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  // A relationship id is `r:id` whatever its namespace prefix.
  for (const m of text.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) out[/:id$/.test(m[1]) ? 'r:id' : m[1]] = m[2];
  return out;
};

/** Every `<t>` run of a string item, phonetic guides left out. */
const runs = (xml: string): string =>
  xmlText(
    [...xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '').matchAll(/<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g)]
      .map((m) => m[1] ?? '')
      .join(''),
  );

/** Excel's built-in date and time formats. */
const DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const PERCENT_FORMATS = new Set([9, 10]);

type CellFormat = { date: boolean; time: boolean; seconds: boolean; percent: boolean };

function cellFormats(styles: string | null): CellFormat[] {
  if (!styles) return [];
  const codes = new Map<number, string>();
  for (const m of styles.matchAll(/<(?:\w+:)?numFmt\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]);
    if (a.numFmtId) codes.set(Number(a.numFmtId), xmlText(a.formatCode ?? ''));
  }
  const xfs = /<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/.exec(styles)?.[1] ?? '';
  return [...xfs.matchAll(/<(?:\w+:)?xf\b([^>]*?)(?:\/>|>)/g)].map((m) => {
    const id = Number(attrs(m[1]).numFmtId ?? 0);
    // A custom code's letters outside its quoted text and [colour] or [$-locale] brackets.
    const code = (codes.get(id) ?? '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '').toLowerCase();
    const custom = codes.has(id) && !DATE_FORMATS.has(id);
    const percent = PERCENT_FORMATS.has(id) || (custom && code.includes('%'));
    const timeLike = custom ? /[hs]/.test(code) : [18, 19, 20, 21, 22, 45, 46, 47].includes(id);
    const dateLike = custom ? /[dy]/.test(code) || (/m/.test(code) && !/[hs]/.test(code)) : DATE_FORMATS.has(id) && !(id >= 18 && id <= 21) && !(id >= 45 && id <= 47);
    return { date: dateLike, time: timeLike, seconds: custom ? code.includes('s') : [19, 21, 45, 46, 47].includes(id), percent };
  });
}

/** A number as Excel shows it plainly: no float noise (0.1 + 0.2 is 0.3). */
const plain = (n: number): string => String(Number(n.toPrecision(15)));

const pad = (n: number) => String(n).padStart(2, '0');

/** A date or time serial in the format's terms: 2026-11-06, 19:30, or both. */
function serialText(serial: number, f: CellFormat, date1904: boolean): string {
  const ms = Math.round((serial + (date1904 ? 1462 : 0) - 25569) * 86_400_000);
  const d = new Date(ms);
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${f.seconds ? `:${pad(d.getUTCSeconds())}` : ''}`;
  if (f.date && f.time) return `${day} ${time}`;
  return f.time ? time : day;
}

/** Column letters to a 0-based index: A is 0, AA is 26. */
const columnOf = (ref: string): number | null => {
  const letters = /^([A-Z]+)\d*$/i.exec(ref)?.[1]?.toUpperCase();
  if (!letters) return null;
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

const TOO_LARGE: SheetRead = { ok: false, error: 'the workbook is too large to read', fix: 'Keep the file under 1 MB, or move older rows to another file.' };
const NOT_A_WORKBOOK: SheetRead = { ok: false, error: 'can’t read it as an Excel workbook', fix: 'Save it again as .xlsx or CSV.' };

/**
 * A workbook's first sheet as rows of text, as a Sheet's CSV export gives them: each cell as
 * Excel shows it plainly (shared and inline strings, numbers without float noise, TRUE/FALSE,
 * dates as 2026-11-06 and times as 19:30), missing rows and cells empty, every row as wide as
 * the widest.
 */
export async function parseXlsx(bytes: ArrayBuffer | Uint8Array): Promise<SheetRead> {
  const JSZip = (await import('jszip')).default;
  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    return NOT_A_WORKBOOK;
  }
  // What the parts unpack to, from the zip's own directory, before anything is inflated: a small
  // zip can hold a very large sheet. JSZip keeps the size on each entry's (untyped) `_data`.
  const unpacked = Object.values(zip.files).reduce((sum, f) => sum + Number((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0);
  if (unpacked > XLSX_MAX_CHARS) return TOO_LARGE;
  const part = async (path: string) => (await zip.file(path)?.async('string')) ?? null;
  const workbook = await part('xl/workbook.xml');
  if (!workbook) return NOT_A_WORKBOOK;
  const date1904 = /<(?:\w+:)?workbookPr\b[^>]*\bdate1904\s*=\s*"(1|true)"/.test(workbook);
  const first = /<(?:\w+:)?sheet\b([^>]*?)\/?>/.exec(workbook);
  const rid = first ? attrs(first[1])['r:id'] : undefined;
  const rels = (await part('xl/_rels/workbook.xml.rels')) ?? '';
  let target: string | undefined;
  for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g)) {
    const a = attrs(m[1]);
    if (a.Id === rid) target = a.Target;
  }
  const sheetPath = target ? (target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`) : 'xl/worksheets/sheet1.xml';
  const sheetFile = zip.file(sheetPath) ?? zip.file('xl/worksheets/sheet1.xml');
  if (!sheetFile) return NOT_A_WORKBOOK;
  const sheet = await sheetFile.async('string');
  if (sheet.length > XLSX_MAX_CHARS) return TOO_LARGE;
  const shared = [...((await part('xl/sharedStrings.xml')) ?? '').matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => runs(m[1]));
  const formats = cellFormats(await part('xl/styles.xml'));

  const rows: string[][] = [];
  let width = 0;
  let nextRow = 0;
  for (const r of sheet.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const at = Number(attrs(r[1]).r ?? nextRow + 1) - 1;
    if (!Number.isInteger(at) || at < nextRow) continue;
    nextRow = at + 1;
    const cells: string[] = [];
    let nextCol = 0;
    for (const c of (r[2] ?? '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const a = attrs(c[1]);
      const col = a.r ? (columnOf(a.r) ?? nextCol) : nextCol;
      nextCol = col + 1;
      const inner = c[2] ?? '';
      const v = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner)?.[1];
      let text: string;
      if (a.t === 'inlineStr') text = runs(/<(?:\w+:)?is\b[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/.exec(inner)?.[1] ?? '');
      else if (v === undefined) text = '';
      else if (a.t === 's') text = shared[Number(v)] ?? '';
      else if (a.t === 'b') text = v.trim() === '1' ? 'TRUE' : 'FALSE';
      else if (a.t === 'str' || a.t === 'e') text = xmlText(v);
      else {
        const n = Number(v);
        const f = formats[Number(a.s ?? 0)];
        text = !Number.isFinite(n) ? xmlText(v) : f?.percent ? `${plain(n * 100)}%` : f && (f.date || f.time) && n >= 0 ? serialText(n, f, date1904) : plain(n);
      }
      while (cells.length < col) cells.push('');
      cells[col] = text;
    }
    while (rows.length < at) rows.push([]);
    rows[at] = cells;
    width = Math.max(width, cells.length);
  }
  // A Sheet's export ends at its last row with anything in it, as wide as its widest row.
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === '')) rows.pop();
  return { ok: true, rows: rows.map((cells) => [...cells, ...Array<string>(Math.max(0, width - cells.length)).fill('')]) };
}

// ── One read ──────────────────────────────────────────────────────────────────

const errorName = (error: unknown): string => (error && typeof error === 'object' && 'name' in error ? String((error as { name: unknown }).name) : '');

/**
 * The read a file source's reader runs every 5 s. It looks the handle up (this browser's), checks
 * Chrome still lets the page read it (never asking: a prompt needs the operator's click), and
 * reads and parses the file only when its lastModified or size moved; otherwise it answers the
 * rows it read last, which the reader's diff turns into no write at all.
 *
 * `parses` counts the file's real reads, for the test.
 */
export function fileRead(o: { handle: () => Promise<FileHandleLike | null>; format: FileFormat }): {
  read: (signal: AbortSignal) => Promise<SheetRead>;
  /** Why this page cannot read the file at all (no handle here, no permission yet), or null. */
  canRead: () => Promise<{ error: string; fix: string } | null>;
  parses: () => number;
} {
  let last: { lastModified: number; size: number; rows: string[][] } | null = null;
  let parses = 0;
  /** Why this page cannot read the file at all: no handle here, or no permission yet. */
  const access = async (): Promise<{ handle: FileHandleLike } | { error: string; fix: string }> => {
    const handle = await o.handle().catch(() => null);
    if (!handle) return { error: FILE_NOT_HERE, fix: 'Choose the file on this computer to keep reading it.' };
    const state = handle.queryPermission ? await handle.queryPermission({ mode: 'read' }).catch(() => 'prompt' as const) : 'granted';
    if (state !== 'granted') return { error: FILE_PERMISSION, fix: 'Press Allow to go on reading it.' };
    return { handle };
  };
  const read = async (signal: AbortSignal): Promise<SheetRead> => {
    const can = await access();
    if (!('handle' in can)) return { ok: false, ...can };
    const { handle } = can;
    let file: FileLike;
    try {
      file = await handle.getFile();
    } catch (error) {
      const name = errorName(error);
      if (name === 'NotFoundError') return { ok: false, error: 'can’t find the file (moved, renamed or deleted)', fix: 'Put it back, or choose it again.' };
      if (name === 'NotAllowedError' || name === 'SecurityError') return { ok: false, error: FILE_PERMISSION, fix: 'Press Allow to go on reading it.' };
      // Excel holds a file while it saves it: the next read finds it again.
      return { ok: false, error: 'can’t read the file just now', fix: 'Reading carries on by itself.' };
    }
    if (signal.aborted) return { ok: false, error: 'the file did not open in 10 seconds', fix: 'Reading carries on by itself.' };
    if (file.size > FILE_MAX_BYTES) return { ok: false, error: 'the file is larger than 1 MB', fix: 'Keep it under 1 MB, or move older rows to another file.' };
    if (last && last.lastModified === file.lastModified && last.size === file.size) return { ok: true, rows: last.rows };
    parses += 1;
    let rows: string[][];
    try {
      if (o.format === 'xlsx') {
        const parsed = await parseXlsx(await file.arrayBuffer());
        if (!parsed.ok) return parsed;
        rows = parsed.rows;
      } else {
        rows = parseCsvFile(await file.text());
      }
    } catch {
      return { ok: false, error: 'can’t read the file just now', fix: 'Reading carries on by itself.' };
    }
    last = { lastModified: file.lastModified, size: file.size, rows };
    return { ok: true, rows };
  };
  const canRead = async () => {
    const can = await access();
    return 'handle' in can ? null : can;
  };
  return { read, canRead, parses: () => parses };
}

/** A file source's reader: the Sheet reader, at the Sheet's cadence, with the file's read. A page
 *  that cannot read the file (another computer, or no permission yet) never holds the lease, so on
 *  a published production it cannot keep the computer that has the file from reading it. */
export function createFileReader(
  o: Omit<SheetReaderOptions, 'link' | 'read'> & { handle: () => Promise<FileHandleLike | null>; format: FileFormat },
): SheetReader & { parses: () => number } {
  const { handle, format, ...rest } = o;
  const file = fileRead({ handle, format });
  return { ...createSheetReader({ ...rest, read: file.read, canRead: file.canRead }), parses: file.parses };
}
