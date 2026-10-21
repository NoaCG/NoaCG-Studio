// CONTENT FORMATS: rows from a spreadsheet, a document or (later) a Sheet, turned into the text
// a list graphic already parses (docs/work-specs/data-sources/spec.md, "Formats", phase C1a).
//
// Five small adapters, one per shape, each writing STRINGS in the grammar its graphic's own
// parser reads. No graphic learns a new format: a ticker still reads its colon rule, a schedule
// its first pipe, a standings board its header line, end credits their roles and headings.
//
//  - lines      tickers: one cell per row; a second cell joins with a tab, the ticker's
//               unambiguous kicker separator. "|" is plain text (tk17 splits languages at it).
//  - schedule   schedule boards: "Time | Programme"; a row missing either is flagged and
//               written as-is, so the board drops it on air exactly as its parser does.
//  - standings  standings boards: the first row IS the header (it names the columns), so its
//               cells after the first become the headers field; both fields change together.
//  - credits    end credits: "Role | Name", "# Heading", "Role:" for a role with no name yet,
//               an interior blank row a section break.
//  - rows       tables: one row is one table row, never joined (`tableRows`).
//
// One header rule for all of them: a first row equal to the adapter's starter header is skipped;
// any other first row is content. A valid read with no rows writes "" (which clears the field
// on air); nothing here ever writes an array, because a list is text in a field.
//
// The custom graphic's data template sits beside them: `Field ID,Label,Value`, one row per
// scalar field, keyed by the field id so a reordered row or an edited label changes nothing.
// Its parser diagnoses rather than redirects: an unknown, duplicate or incompatible row is
// reported and skipped, a missing row keeps the field's value, an empty Value clears.
//
// Pure and Node-importable (production-page spec §5.2): scripts/content-formats.test.mjs runs it.
import type { SavedGraphic } from '../model/packets';
import type { FieldDescriptor } from '../model/fieldModel';
import { detectSeparator, parseDelimited, serializeCsv } from '../model/csv.ts';

export type ListAdapter = 'lines' | 'schedule' | 'standings' | 'credits';

/** Which adapter a list field takes, and the field ids it writes. `main` is the field the
 *  operator fills from; standings also write their `headers` field in the same edit. */
export interface ListFormat {
  adapter: ListAdapter;
  main: string;
  headers?: string;
}

/** The first row a starter download carries, and the one a paste may repeat and have skipped.
 *  Lines have none, and standings use their own header row as content. */
export const STARTER_HEADERS: Record<ListAdapter, string[] | null> = {
  lines: null,
  schedule: ['Time', 'Programme'],
  standings: null,
  credits: ['Role', 'Name'],
};

/** The first cell of a standings starter's header row, which names the competitor column. */
const STANDINGS_NAME = 'Name';

/** credits' ROLE_LABEL_MAX (templates/endCredits/shared.ts): a longer text before a colon is a
 *  sentence, not a job title. */
const ROLE_LABEL_MAX = 48;

/**
 * The list format of a pool graphic's field, or null when it takes plain text.
 *
 * Read from what the graphic IS, never from a field title the operator can rename: its type,
 * and for the two types that hold other designs too, the runtime that reads the field.
 */
export function listFormatFor(graphic: Pick<SavedGraphic, 'type'> & { template: { js?: string } }, fieldId: string): ListFormat | null {
  const js = graphic.template.js ?? '';
  if (graphic.type === 'ticker' && fieldId === 'f0') return { adapter: 'lines', main: 'f0' };
  if (graphic.type === 'end-credits' && fieldId === 'f0') return { adapter: 'credits', main: 'f0' };
  // scheduleRowsRuntimeJs (templates/infographics/dataRuntimes.ts) draws `.infographic-time`.
  if (graphic.type === 'infographic' && fieldId === 'f0' && js.includes('infographic-time')) {
    return { adapter: 'schedule', main: 'f0' };
  }
  // STANDINGS_RUNTIME_JS (templates/competition/results/shared.ts): rows in f2, headers in f3.
  if (graphic.type === 'results-board' && (fieldId === 'f2' || fieldId === 'f3') && js.includes('-row-cells')) {
    return { adapter: 'standings', main: 'f2', headers: 'f3' };
  }
  return null;
}

// ── Reading pasted text into cells ──────────────────────────────────────────

/**
 * What the operator pasted, as rows of cells. Cells copied from a spreadsheet arrive
 * tab-separated, with a cell holding a line break quoted; lines from a document arrive one per
 * line, each a single cell.
 *
 * Not `parseDelimited`: a spreadsheet quotes only the cells that need it, so a headline that merely
 * OPENS with a quotation ("Unbelievable" says coach) must stay as typed. A cell is read as quoted
 * only when its closing quote ends the cell; anything else is literal text.
 */
export function pastedCells(text: string): string[][] {
  const src = text.replace(/\r\n?/g, '\n');
  // One copied column has no tabs, but still quotes a cell holding a line break; a document line
  // that is merely in quotes keeps them.
  const multilineOnly = !src.includes('\t');
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  while (i <= src.length) {
    let cell = '';
    const quoted = src[i] === '"' ? quotedCell(src, i) : null;
    if (quoted && (!multilineOnly || quoted.text.includes('\n'))) {
      cell = quoted.text;
      i = quoted.end;
    } else {
      while (i < src.length && src[i] !== '\t' && src[i] !== '\n') cell += src[i++];
    }
    row.push(cell);
    if (src[i] === '\t') {
      i++;
      continue;
    }
    rows.push(row);
    row = [];
    i++;
  }
  // A trailing line break is not a last, empty row.
  if (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
}

/** A quoted cell starting at `at`: its text and the index just past its closing quote, or null
 *  when the quotes do not close the cell (then the quote is part of the text). */
function quotedCell(src: string, at: number): { text: string; end: number } | null {
  let text = '';
  let i = at + 1;
  while (i < src.length) {
    if (src[i] === '"') {
      if (src[i + 1] === '"') {
        text += '"';
        i += 2;
        continue;
      }
      const next = src[i + 1];
      return next === undefined || next === '\t' || next === '\n' ? { text, end: i + 1 } : null;
    }
    text += src[i++];
  }
  return null;
}

/** One line a fill writes, as the preview lists it; `problem` flags a malformed row. */
export interface FilledRow {
  text: string;
  problem?: string;
}

/** A list fill: the field values to write in one edit, and the rows for the preview. */
export interface ListFill {
  values: Record<string, string>;
  rows: FilledRow[];
}

/** A cell as one line of text: a line break inside a cell would split one row into two. */
const cellText = (cell: string): string => cell.replace(/\s*\n\s*/g, ' ').trim();

/** Without its trailing empty cells, which a wide spreadsheet selection always brings. */
function trimRow(cells: string[]): string[] {
  const out = cells.map(cellText);
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out;
}

/** The rows that carry content: blank rows at either end are dropped, interior ones kept. */
function trimmedRows(cells: string[][]): string[][] {
  const rows = cells.map(trimRow);
  let start = 0;
  let end = rows.length;
  while (start < end && rows[start].length === 0) start++;
  while (end > start && rows[end - 1].length === 0) end--;
  return rows.slice(start, end);
}

const sameRow = (row: string[], header: string[]): boolean =>
  row.length === header.length && row.every((cell, i) => cell.toLowerCase() === header[i].toLowerCase());

/** The rows after the header rule: the adapter's own starter header, repeated, is skipped. */
function contentRows(adapter: ListAdapter, cells: string[][]): { rows: string[][]; raw: string[][] } {
  // `raw` keeps each row's cell COUNT, which credits need: "Camera<TAB>" is a role waiting for
  // names, while a lone "Camera" line from a document is whatever the credits grammar says.
  // Blank rows at either end go, interior ones stay; the same cut applies to both views.
  const header = STARTER_HEADERS[adapter];
  const trimmed = trimmedRows(cells);
  const lead = cells.findIndex((r) => trimRow(r).length > 0);
  const raw = lead < 0 ? [] : cells.slice(lead, lead + trimmed.length);
  // A header copied as one document line ("Time | Programme") is the header too.
  if (header && trimmed.length > 0 && (sameRow(trimmed[0], header) || sameRow(splitPipes(trimmed[0], false), header))) {
    return { rows: trimmed.slice(1), raw: raw.slice(1) };
  }
  return { rows: trimmed, raw };
}

/** A single cell written as the field's own line ("20:00 | News") splits at its pipes. */
function splitPipes(row: string[], firstOnly: boolean): string[] {
  if (row.length !== 1 || !row[0].includes('|')) return row;
  if (!firstOnly) return row[0].split('|').map((c) => c.trim());
  const at = row[0].indexOf('|');
  return [row[0].slice(0, at).trim(), row[0].slice(at + 1).trim()];
}

/**
 * Fill a list field from rows of cells. The result's `values` are the whole edit (both fields
 * for standings); `rows` is what the preview lists, with each malformed row flagged.
 */
export function fillList(format: ListFormat, cells: string[][]): ListFill {
  const { rows, raw } = contentRows(format.adapter, cells);
  switch (format.adapter) {
    case 'lines':
      return finish(format, rows.map(tickerRow));
    case 'schedule':
      return finish(format, rows.filter((r) => r.length > 0).map((r) => scheduleRow(splitPipes(r, true))));
    case 'credits':
      return finish(format, rows.map((r, i) => creditsRow(r, raw[i]?.length ?? r.length)));
    case 'standings':
      return standings(format, rows.filter((r) => r.length > 0).map((r) => splitPipes(r, false)));
  }
}

function finish(format: ListFormat, rows: FilledRow[]): ListFill {
  return { values: { [format.main]: rows.map((r) => r.text).join('\n') }, rows };
}

function tickerRow(row: string[]): FilledRow {
  if (row.length === 0) return { text: '' };
  const [kicker, story, ...rest] = row;
  const text = story === undefined || story === '' ? kicker : kicker === '' ? story : `${kicker}\t${story}`;
  return rest.some((c) => c !== '') ? { text, problem: 'Only the first two cells are used' } : { text };
}

function scheduleRow(row: string[]): FilledRow {
  const [time = '', programme = '', ...rest] = row;
  const text = `${time} | ${programme}`.trim();
  if (time === '' || programme === '') return { text, problem: 'Needs a time and a programme' };
  if (time.includes('|')) return { text, problem: 'A time cannot contain |' };
  if (rest.some((c) => c !== '')) return { text, problem: 'Only the first two cells are used' };
  return { text };
}

function creditsRow(row: string[], width: number): FilledRow {
  if (row.length === 0) return { text: '' }; // an interior blank row: a section break
  if (width === 1) return { text: row[0] }; // a document line, already in the credits grammar
  const [role, ...names] = row;
  if (role.startsWith('#')) return { text: row.filter((c) => c !== '').join(' | ') };
  const name = names.filter((c) => c !== '').join(' ');
  if (role === '') return { text: name };
  if (name !== '') return { text: `${role} | ${name}` };
  // The credits parser reads "Role:" as a role only up to its label length.
  const text = `${role}:`;
  return role.length <= ROLE_LABEL_MAX ? { text } : { text, problem: `A role without a name has at most ${ROLE_LABEL_MAX} characters` };
}

function standings(format: ListFormat, rows: string[][]): ListFill {
  if (rows.length === 0) return { values: { [format.main]: '', [format.headers!]: '' }, rows: [] };
  const [head, ...body] = rows;
  const columns = head.slice(1);
  // The header row is content by definition; a first row of figures is a team that lost its header.
  const figures = columns.length > 0 && columns.every((c) => c === '' || Number.isFinite(Number(c.replace(/^\+/, ''))));
  const out: FilledRow[] = [figures ? { text: head.join(' | '), problem: 'The first row names the columns' } : { text: head.join(' | ') }];
  const lines: string[] = [];
  for (const row of body) {
    const text = row.join(' | ');
    lines.push(text);
    if (row[0] === '') out.push({ text, problem: 'Needs a name in the first cell' });
    else if (row.length - 1 > columns.length) out.push({ text, problem: `${row.length - 1} values for ${columns.length} columns` });
    else out.push({ text });
  }
  return { values: { [format.main]: lines.join('\n'), [format.headers!]: columns.join(' | ') }, rows: out };
}

// ── Starter rows: the field's current content, as rows a spreadsheet opens ────────

/** The rows a starter download carries: the adapter's header where it has one, then the field's
 *  current content, so filling the file in starts from what is on the graphic now. */
export function starterRows(format: ListFormat, values: Record<string, string>): string[][] {
  const lines = (values[format.main] ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim());
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  while (lines.length > 0 && lines[0] === '') lines.shift();
  const header = STARTER_HEADERS[format.adapter];
  switch (format.adapter) {
    case 'lines':
      return lines.map((l) => {
        const tab = l.indexOf('\t');
        return tab > 0 ? [l.slice(0, tab).trim(), l.slice(tab + 1).trim()] : [l];
      });
    case 'schedule':
      return [header!, ...lines.filter((l) => l !== '').map((l) => splitPipes([l], true))];
    case 'standings': {
      const columns = (values[format.headers!] ?? '').split('|').map((c) => c.trim()).filter((c) => c !== '');
      return [[STANDINGS_NAME, ...columns], ...lines.filter((l) => l !== '').map((l) => l.split('|').map((c) => c.trim()))];
    }
    case 'credits':
      return [header!, ...lines.map(creditsCells)];
  }
}

/** One credits line as [role, name], in the grammar's own order of precedence. */
function creditsCells(line: string): string[] {
  if (line === '') return ['', ''];
  if (line.startsWith('#')) return [line, ''];
  const split = line.split(/\t|\|/);
  if (split.length >= 2) return [split[0].trim(), split.slice(1).join(' ').trim()];
  const mark = line.search(/[:;]/);
  if (mark > 0 && mark <= ROLE_LABEL_MAX) return [line.slice(0, mark).trim(), line.slice(mark + 1).trim()];
  return ['', line];
}

/** The starter rows as a CSV file, or "" when the field holds nothing and has no header. */
export function starterCsv(format: ListFormat, values: Record<string, string>): string {
  const [first, ...rest] = starterRows(format, values);
  return first ? serializeCsv(first, rest) : '';
}

// ── rows: a table, one row per row ─────────────────────────────────────────

/** Rows of cells into table rows by column position, the starter header (the column labels)
 *  skipped when repeated. A row with more cells than columns is flagged; nothing is joined. */
export function tableRows(
  columns: { key: string; label: string }[],
  cells: string[][],
): { rows: Record<string, string>[]; problems: { row: number; message: string }[] } {
  const all = cells.map(trimRow);
  const labels = columns.map((c) => c.label.trim());
  const start = all.length > 0 && sameRow(all[0], labels) ? 1 : 0;
  const rows: Record<string, string>[] = [];
  const problems: { row: number; message: string }[] = [];
  all.forEach((row, i) => {
    if (i < start || row.length === 0) return;
    if (row.length > columns.length) problems.push({ row: i + 1, message: `${row.length} cells for ${columns.length} columns` });
    rows.push(Object.fromEntries(columns.map((c, at) => [c.key, row[at] ?? ''])));
  });
  return { rows, problems };
}

// ── The custom graphic's data template: Field ID, Label, Value ─────────────────────

export const SCALAR_HEADER = ['Field ID', 'Label', 'Value'] as const;

/** The fields a data template carries: every editable value but pictures, and but the list
 *  fields an adapter fills (those have their own starter rows). */
export function scalarFields(graphic: Pick<SavedGraphic, 'type'> & { template: { js?: string } }, descriptors: FieldDescriptor[]): FieldDescriptor[] {
  return descriptors.filter((d) => d.kind !== 'image' && !listFormatFor(graphic, d.key));
}

/** The data template, filled with the values the cue holds now (its defaults where unset). */
export function scalarTemplateCsv(fields: FieldDescriptor[], values: Record<string, string>): string {
  return serializeCsv([...SCALAR_HEADER], fields.map((d) => [d.key, d.label, values[d.key] ?? String(d.defaultValue ?? '')]));
}

/** One diagnosis of a data template; `row` is the file's own row number, 1-based. */
export interface ScalarProblem {
  row?: number;
  field?: string;
  message: string;
}

/**
 * Read a filled-in data template against the graphic's fields. Every row is read before
 * anything is decided, so a duplicate is caught whichever copy comes first.
 *
 * `values` holds only the rows that are sound; every other field keeps what it has.
 */
export function parseScalarCsv(text: string, fields: FieldDescriptor[]): { values: Record<string, string>; problems: ScalarProblem[] } {
  const all = parseDelimited(text, detectSeparator(text)).map((r, i) => ({ cells: r, row: i + 1 }));
  const rows = all.filter((r) => r.cells.some((c) => c.trim() !== ''));
  const problems: ScalarProblem[] = [];
  const missingAll = (): ScalarProblem[] =>
    fields.map((d) => ({ field: d.key, message: `${d.key} (${d.label}) is missing, so it keeps its value` }));

  if (rows.length === 0) return { values: {}, problems: missingAll() };
  const head = rows[0].cells.map((c) => c.trim().toLowerCase());
  const idAt = head.indexOf('field id');
  const valueAt = head.indexOf('value');
  if (idAt < 0 || valueAt < 0) {
    return { values: {}, problems: [{ row: rows[0].row, message: 'The first row must name the columns Field ID, Label and Value' }, ...missingAll()] };
  }

  const byKey = new Map(fields.map((d) => [d.key, d]));
  const seen = new Map<string, number[]>();
  const read = new Map<string, string>();
  for (const { cells, row } of rows.slice(1)) {
    const id = (cells[idAt] ?? '').trim();
    const raw = (cells[valueAt] ?? '').replace(/\r\n?/g, '\n');
    if (id === '') {
      problems.push({ row, message: `Row ${row} has no Field ID` });
      continue;
    }
    const field = byKey.get(id);
    if (!field) {
      problems.push({ row, field: id, message: `Row ${row}: this graphic has no field ${id}` });
      continue;
    }
    seen.set(id, [...(seen.get(id) ?? []), row]);
    const value = valueFor(field, raw);
    if (value === null) {
      problems.push({ row, field: id, message: `Row ${row}: ${id} (${field.label}) cannot hold "${raw}"` });
      continue;
    }
    read.set(id, value);
  }

  const values: Record<string, string> = {};
  for (const d of fields) {
    const at = seen.get(d.key);
    if (!at) problems.push({ field: d.key, message: `${d.key} (${d.label}) is missing, so it keeps its value` });
    else if (at.length > 1) problems.push({ field: d.key, message: `${d.key} (${d.label}) is on rows ${at.join(' and ')}, so it keeps its value` });
    else if (read.has(d.key)) values[d.key] = read.get(d.key)!;
  }
  return { values, problems };
}

/** The value a field takes from a cell, or null when its type cannot hold it. Empty clears.
 *  Shared with the Sheet reader (sheetSource.ts), so a Sheet cell and a template row read alike. */
export function valueFor(field: FieldDescriptor, raw: string): string | null {
  if (raw.trim() === '') return '';
  switch (field.kind) {
    case 'number': {
      const n = Number(raw.trim());
      return Number.isFinite(n) ? raw.trim() : null;
    }
    case 'toggle': {
      const v = raw.trim().toLowerCase();
      if (v === '1' || v === 'true') return '1';
      if (v === '0' || v === 'false') return '0';
      return null;
    }
    case 'select':
      return field.options?.some((o) => o.value === raw.trim()) ? raw.trim() : null;
    default:
      return raw;
  }
}
