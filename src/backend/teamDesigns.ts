// A TEAM RECORD WITHOUT ITS DESIGNS (docs/work-specs/live-publishing/designs/G5-team-record.md).
//
// A team production's record used to carry every graphic's full template, so every save sent and
// rewrote megabytes. Migration 0125 stores each design once per production under a name the server
// computes from its content, and a SPLIT record carries `designRef: <name>` in place of `template`.
//
// This module is the page's half, with the server passed in so it can be tested against a model:
//   splitRecord    a stored-form record (assets already out) with its designs put and named
//   resolveRecord  a received record with every `designRef` made a `template` again (R1, R11)
// The page holds whole records only: the Show in memory, the merge, Undo and publishing never see
// a `designRef`.
//
// A page learns names only from the server: from the designs it reads and the designs it puts, by
// each body's canonical JSON. A design whose text the page cannot match is put again; the server
// names it the same and stores nothing new, so the cost is bytes, never a wrong design.

import { canonicalJson } from './unitPatch';

/** What the page asks the server about designs (team_designs_put and team_designs_read). */
export interface DesignServer {
  /** Stores the bodies, answering their names in order. Throws on failure. */
  put(id: string, bodies: Record<string, unknown>[]): Promise<string[]>;
  /** The named designs this production holds; a name not stored is left out. Throws on failure. */
  read(id: string, names: string[]): Promise<{ name: string; body: Record<string, unknown> }[]>;
}

/** G5 R15: at most 1 MB of JSON per put (or one design), at most 8 designs per read. */
export const PUT_BYTES = 1_000_000;
export const READ_NAMES = 8;

/** Whether a page splits its saves (G5 R10): only once the server has the designs, its switch is
 *  on, and the page can name its images by content (Web Crypto). */
export function savesSplit(state: { installed: boolean | null; on: boolean; webCrypto: boolean }): boolean {
  return state.installed === true && state.on && state.webCrypto;
}

/** The record forms this build knows: null whole, 1 split (G5 Terms). */
export const KNOWN_FORMS: ReadonlySet<number | null> = new Set([null, 1]);

interface Book {
  /** name -> body, as the server stores it. */
  bodies: Map<string, Record<string, unknown>>;
  /** canonical JSON of a body -> its name. */
  names: Map<string, string>;
}

const books = new Map<string, Book>();

function book(id: string): Book {
  let b = books.get(id);
  if (!b) books.set(id, (b = { bodies: new Map(), names: new Map() }));
  return b;
}

function learn(b: Book, name: string, body: Record<string, unknown>, text = canonicalJson(body)): void {
  b.bodies.set(name, body);
  b.names.set(text, name);
}

/** Forget a production's names (a `missing` answer), or every production's (sign-out). */
export function forgetDesigns(id?: string, names?: readonly string[]): void {
  if (id === undefined) { books.clear(); return; }
  if (!names) { books.delete(id); return; }
  const b = books.get(id);
  if (!b) return;
  const gone = new Set(names);
  for (const n of gone) b.bodies.delete(n);
  for (const [text, n] of [...b.names]) if (gone.has(n)) b.names.delete(text);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Whether a record names any design: its form by content. */
export function isSplit(doc: unknown): boolean {
  return isObject(doc) && Array.isArray(doc.graphics) && doc.graphics.some((g) => isObject(g) && 'designRef' in g);
}

/** A record of a form this build does not know: never held (G5 R11). */
export class UnknownRecordForm extends Error {
  constructor(form: unknown) {
    super(`This team production was saved by a newer version of NoaCG (record form ${String(form)}). Reload this page to edit.`);
  }
}

/** The record with every `designRef` back as its `template`, reading only the names this page does
 *  not hold (at most READ_NAMES per call). Throws when a name cannot be resolved or the form is one
 *  this build does not know, so the caller keeps what it shows. */
export async function resolveRecord<T>(id: string, doc: T, form: number | null | undefined, server: DesignServer): Promise<T> {
  if (form !== undefined && !KNOWN_FORMS.has(form)) throw new UnknownRecordForm(form);
  if (!isSplit(doc)) return doc;
  const record = doc as unknown as Record<string, unknown>;
  const graphics = record.graphics as unknown[];
  const b = book(id);
  const wanted = [...new Set(graphics.flatMap((g) => (isObject(g) && typeof g.designRef === 'string' && !b.bodies.has(g.designRef) ? [g.designRef] : [])))];
  for (let i = 0; i < wanted.length; i += READ_NAMES) {
    for (const { name, body } of await server.read(id, wanted.slice(i, i + READ_NAMES))) {
      if (isObject(body)) learn(b, name, body);
    }
  }
  const whole = graphics.map((g) => {
    if (!isObject(g) || !('designRef' in g)) return g;
    const body = typeof g.designRef === 'string' ? b.bodies.get(g.designRef) : undefined;
    if (!body) throw new Error('A design of this team production could not be read.');
    const { designRef: _name, ...rest } = g;
    // A copy, so the page never shares an object with the book.
    return { ...rest, template: JSON.parse(JSON.stringify(body)) as unknown };
  });
  return { ...record, graphics: whole } as unknown as T;
}

/** The split record of a stored-form record (its assets already replaced by Storage references,
 *  under content names): designs this page has no name for are put (at most PUT_BYTES of JSON per
 *  call), then each graphic carries `designRef`. Answers null when the record cannot be split (a
 *  graphic without an object template): the caller saves it whole. */
export async function splitRecord(id: string, stored: Record<string, unknown>, server: DesignServer): Promise<Record<string, unknown> | null> {
  if (!Array.isArray(stored.graphics)) return stored;
  const graphics = stored.graphics as unknown[];
  if (graphics.some((g) => !isObject(g) || !isObject(g.template) || 'designRef' in g)) return null;
  const b = book(id);
  const texts = graphics.map((g) => canonicalJson((g as Record<string, unknown>).template));
  const fresh = new Map<string, Record<string, unknown>>();
  texts.forEach((text, i) => {
    if (!b.names.has(text) && !fresh.has(text)) fresh.set(text, (graphics[i] as Record<string, unknown>).template as Record<string, unknown>);
  });
  let batch: [string, Record<string, unknown>][] = [];
  let bytes = 0;
  const send = async () => {
    if (batch.length === 0) return;
    const names = await server.put(id, batch.map(([, body]) => body));
    if (names.length !== batch.length) throw new Error('The designs were not all saved.');
    batch.forEach(([text, body], i) => learn(b, names[i], body, text));
    batch = [];
    bytes = 0;
  };
  for (const [text, body] of fresh) {
    if (batch.length > 0 && bytes + text.length > PUT_BYTES) await send();
    batch.push([text, body]);
    bytes += text.length;
  }
  await send();
  return {
    ...stored,
    graphics: graphics.map((g, i) => {
      const { template: _design, ...rest } = g as Record<string, unknown>;
      return { ...rest, designRef: b.names.get(texts[i])! };
    }),
  };
}
