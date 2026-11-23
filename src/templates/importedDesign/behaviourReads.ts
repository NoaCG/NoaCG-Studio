// WHAT A BEHAVIOUR RUNTIME CAN READ (docs/work-specs/svg-template-library/spec.md, TL2 Rules C1-C8).
//
// A saved graphic keeps the paint runtime it was built with, frozen in its own template.js, and
// that runtime meets a word it does not know without a sound: an unknown kind, fact or derivation
// reads as false or null, and a readout with no value is left as drawn. So a table that asks for
// a word its runtime cannot read would simply do nothing on air. This module is the one place
// that says which words a runtime reads, and the check that refuses a table asking for more.
//
//   * The VOCABULARY of a table is every word it asks of a runtime, read off the raw JSON (C1).
//   * A runtime built from now on carries its own READS, `var NOACG_BEHAVIOUR_READS = {...};`,
//     per variant (C2). One built before carries none and reads the FROZEN pre-TL2 vocabulary,
//     cut to what its code defines.
//   * READS grows only by an entry in `READS_ADDED`, in the commit that teaches the runtime the
//     word (C4). A runtime change that adds no word (#2691's readout alignment) leaves it alone.
//
// Pure and DOM-free: the validator and the Node gates call it with a template's JS.
// Documented limits: a word added INSIDE an existing kind before TL2 is not told apart (the build
// always emitted those tables with their own runtime), and READS is trusted as written, so only a
// deliberate hand edit of READS can fake a pass.

/** What one field kind reads: the keys of its spec, the facts and the derivations it answers.
 *  A fact or derivation with an argument is listed by its prefix, colon included (`is:`). */
export interface KindReads {
  spec: string[];
  facts: string[];
  derive: string[];
}

/** A runtime's declaration of every word it reads. */
export interface BehaviourReads {
  /** This declaration's own format version. */
  v: 1;
  /** The table versions (`NOACG_BEHAVIOUR.version`) it reads. */
  tables: number[];
  /** Top-level keys of the table. */
  table: string[];
  kinds: Record<string, KindReads>;
  /** Keys of a paint rule, and of its `when`. */
  rule: string[];
  when: string[];
  /** Values of `enter`, and the heads of `default` (`badge` for `badge:LIVE`). */
  enter: string[];
  default: string[];
}

export const READS_VERSION = 1;

/**
 * THE FROZEN PRE-TL2 VOCABULARY: every word the runtime of df0c7a0 (the last main before this
 * plan) reads, extracted from its code (scripts/behaviour-reads.test.mjs checks it against the
 * frozen fixture's own runtime text). It NEVER changes: it is what every graphic built before
 * TL2 is judged by. New words go in READS_ADDED.
 */
export const READS_BEFORE_TL2: BehaviourReads = Object.freeze({
  v: 1,
  tables: [1],
  // `version`, `recipe`, `parts` and `options` are emitted by every build and ignored by the
  // runtime; refusing them would refuse every graphic.
  table: ['version', 'recipe', 'parts', 'options', 'rows', 'fields', 'kinds', 'paint'],
  kinds: {
    text: { spec: ['kind'], facts: [], derive: ['text'] },
    select: { spec: ['kind'], facts: ['is:'], derive: ['text'] },
    'row-pick': { spec: ['kind', 'rows'], facts: ['picked', 'unpicked', 'before', 'after'], derive: ['text'] },
    counter: { spec: ['kind', 'min', 'max'], facts: ['reached:', 'is:', 'at-min', 'at-max', 'zero'], derive: ['value', 'text'] },
    list: { spec: ['kind', 'rows', 'when'], facts: ['listed'], derive: ['total', 'label', 'figure', 'line', 'text'] },
    'row-set': { spec: ['kind', 'rows'], facts: ['listed', 'unlisted', 'last', 'any', 'none'], derive: ['count', 'last', 'key', 'text'] },
    puzzle: { spec: ['kind', 'rows', 'revealed'], facts: ['used', 'shown', 'hidden'], derive: ['letter', 'text'] },
    number: { spec: ['kind', 'group'], facts: ['moved', 'zero'], derive: ['text', 'value'] },
    rank: { spec: ['kind', 'rows', 'role', 'order'], facts: [], derive: ['slot', 'place', 'slot-place', 'text'] },
    share: { spec: ['kind', 'rows'], facts: ['listed', 'leader'], derive: ['label', 'share', 'percent'] },
    fraction: { spec: ['kind', 'total'], facts: ['full', 'empty'], derive: ['fraction', 'percent', 'text'] },
    'vote-status': { spec: ['kind', 'fallback'], facts: ['closed', 'open'], derive: ['text'] },
    clock: { spec: ['kind', 'warnAt'], facts: ['expired', 'warning'], derive: ['fraction'] },
  },
  rule: ['look', 'rows', 'row', 'when', 'enter', 'default', 'anchor', 'gauge', 'write', 'from', 'place'],
  when: ['state', 'facts'],
  enter: ['pop'],
  default: ['row-highlight', 'row-mark', 'badge'],
} as BehaviourReads);

/**
 * EVERY WORD ADDED SINCE TL2, in order, each with the commit that taught the runtime to read it.
 * Additive only: a word is never removed while the table format is version 1. Empty at TL2.
 */
export const READS_ADDED: Array<{ since: string; what: string; reads: Partial<Omit<BehaviourReads, 'v' | 'kinds'>> & { kinds?: Record<string, Partial<KindReads>> } }> = [
  { since: 'TL4', what: "a look's own motion: the countdown's last stretch pulses, zero flashes once", reads: { enter: ['pulse', 'flash'] } },
  { since: 'TL5', what: "a vote row's own count, printed beside its share (Vote results)", reads: { kinds: { share: { derive: ['count'] } } } },
  { since: 'TL5', what: "a choice's starting option: a value naming no row picks it, so the choice is never empty", reads: { kinds: { 'row-pick': { spec: ['start'] } } } },
  { since: 'TL5', what: "a quiz row in use: its answer has text, so one board plays two, three or four answers", reads: { kinds: { text: { facts: ['filled'] } } } },
  { since: 'TL5', what: "a milestone track: a list read against a figure, its tiers reached, the segment between two, the figure as typed", reads: { kinds: { list: { spec: ['of'], facts: ['reached', 'has-label', 'has-amount'], derive: ['span', 'amount'] } } } },
  { since: 'TL5', what: "a quiz drawing its answer rows: a pick or a key naming a row not in use names nothing", reads: { kinds: { 'row-pick': { spec: ['inUse'] } } } },
  { since: 'TL6', what: "a crawl: a text layer that travels inside its window at the operator's pace, the lines it prints joined into one run", reads: { rule: ['crawl', 'speed', 'window'], kinds: { lines: { spec: ['kind'], facts: [], derive: ['joined', 'text'] } } } },
  { since: 'TL6', what: "a speaking timer: each side's clock run by the debate engine, and whether it has run out", reads: { kinds: { speaking: { spec: ['kind', 'side'], facts: ['expired'], derive: ['text'] } } } },
  { since: 'TL6', what: "a word cloud: each slot's word from staged counts, sized by its weight and kept inside its drawn sample", reads: { rule: ['size'], kinds: { 'word-counts': { spec: ['kind', 'rows'], facts: ['listed'], derive: ['label', 'weight', 'text'] } } } },
];

const union = <T>(a: T[], b: T[] = []): T[] => [...a, ...b.filter((w) => !a.includes(w))];

function merged(): BehaviourReads {
  const out: BehaviourReads = JSON.parse(JSON.stringify(READS_BEFORE_TL2));
  for (const { reads } of READS_ADDED) {
    out.tables = union(out.tables, reads.tables);
    for (const key of ['table', 'rule', 'when', 'enter', 'default'] as const) out[key] = union(out[key], reads[key]);
    for (const [kind, add] of Object.entries(reads.kinds ?? {})) {
      const has = out.kinds[kind] ?? { spec: ['kind'], facts: [], derive: [] };
      out.kinds[kind] = { spec: union(has.spec, add.spec), facts: union(has.facts, add.facts), derive: union(has.derive, add.derive) };
    }
  }
  return out;
}

/** What the runtime this build emits reads. `withClock` false: the tick never reaches the clock
 *  kind (`clockPainted` is not emitted), so the clock is not a word that runtime reads. */
export function runtimeReads(withClock: boolean): BehaviourReads {
  const reads = merged();
  if (!withClock) delete reads.kinds.clock;
  return reads;
}

const READS_DECL = 'var NOACG_BEHAVIOUR_READS = ';
const TABLE_DECL = 'var NOACG_BEHAVIOUR = ';

/** The declaration, as the runtime emits it: one line of strict JSON. */
export function readsJs(withClock: boolean): string {
  return `${READS_DECL}${JSON.stringify(runtimeReads(withClock))};`;
}

/** The JSON object literal after `decl` in `js`, parsed, or undefined when absent or unreadable.
 *  Brace matching respects JSON strings. */
function jsonAfter(js: string, decl: string): unknown {
  const at = js.indexOf(decl);
  if (at === -1) return undefined;
  const start = js.indexOf('{', at + decl.length);
  if (start === -1) return undefined;
  let depth = 0;
  let inString = false;
  for (let i = start; i < js.length; i++) {
    const c = js[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(js.slice(start, i + 1));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

const has = (js: string, text: string) => js.includes(text);
const definesKind = (js: string, kind: string) => has(js, `noacgKinds.${kind} = `) || has(js, `noacgKinds['${kind}'] = `);

/** What a template's saved runtime reads:
 *  - `declared`: its own READS;
 *  - `frozen`: no READS (built before TL2), so the frozen vocabulary cut to what its code defines;
 *  - `unknown`: READS of a version this build does not know - the check cannot be made;
 *  - `none`: no behaviour runtime at all. */
export type RuntimeReads =
  | { status: 'declared' | 'frozen'; reads: BehaviourReads }
  | { status: 'unknown'; v: unknown }
  | { status: 'none' };

export function readsOfRuntime(js: string): RuntimeReads {
  if (!/function noacgRepaint\(/.test(js)) return { status: 'none' };
  if (js.includes(READS_DECL)) {
    const raw = jsonAfter(js, READS_DECL) as { v?: unknown } | undefined;
    if (!raw || raw.v !== READS_VERSION) return { status: 'unknown', v: raw?.v };
    return { status: 'declared', reads: raw as BehaviourReads };
  }
  const reads: BehaviourReads = JSON.parse(JSON.stringify(READS_BEFORE_TL2));
  for (const kind of Object.keys(reads.kinds)) if (!definesKind(js, kind)) delete reads.kinds[kind];
  if (!has(js, 'function clockPainted(')) delete reads.kinds.clock;
  if (!has(js, 'function noacgPlaceAll(')) reads.rule = reads.rule.filter((k) => k !== 'place');
  if (!has(js, 'function noacgDefaultEl(')) {
    reads.default = [];
    reads.rule = reads.rule.filter((k) => k !== 'default');
  }
  if (!has(js, 'function noacgPop(')) reads.enter = [];
  return { status: 'frozen', reads };
}

/** A fact or derivation name as vocabulary: an argument is free text, so `is:closed` is `is:`. */
const wordOf = (name: string) => (name.includes(':') ? name.slice(0, name.indexOf(':') + 1) : name);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every word a table asks a runtime to read (C1), from the RAW table: an unknown key is a word
 *  too. Words read `table.<key>`, `version:<n>`, `kind:<kind>`, `kind:<kind>.<key>`,
 *  `fact:<kind>.<name>`, `derive:<kind>.<name>`, `rule.<key>`, `when.<key>`, `enter:<value>`,
 *  `default:<head>`. Names inside `options`, `rows` and `fields`, roles, states and row keys are
 *  free text, not vocabulary. */
export function tableWords(raw: unknown): string[] {
  const words = new Set<string>();
  if (!isRecord(raw)) return [];
  for (const key of Object.keys(raw)) words.add(`table.${key}`);
  words.add(raw.version === undefined ? 'version:none' : `version:${String(raw.version)}`);
  const fields = isRecord(raw.fields) ? raw.fields : {};
  const kinds = isRecord(raw.kinds) ? raw.kinds : {};
  for (const spec of Object.values(kinds)) {
    if (!isRecord(spec)) continue;
    const kind = String(spec.kind);
    words.add(`kind:${kind}`);
    for (const key of Object.keys(spec)) words.add(`kind:${kind}.${key}`);
  }
  const kindsOf = (head: string): string[] => {
    const mapped = fields[head];
    const ids = typeof mapped === 'string' ? [mapped] : isRecord(mapped) ? Object.values(mapped).map(String) : /^f\d+$/.test(head) ? [head] : [];
    return ids.map((id) => {
      const spec = kinds[id];
      return isRecord(spec) ? String(spec.kind) : 'text';
    });
  };
  const ask = (slot: 'fact' | 'derive', token: unknown) => {
    if (typeof token !== 'string' || !token.includes(':')) return;
    const at = token.indexOf(':');
    for (const kind of kindsOf(token.slice(0, at))) words.add(`${slot}:${kind}.${wordOf(token.slice(at + 1))}`);
  };
  for (const rule of Array.isArray(raw.paint) ? raw.paint : []) {
    if (!isRecord(rule)) continue;
    for (const key of Object.keys(rule)) words.add(`rule.${key}`);
    if (isRecord(rule.when)) {
      for (const key of Object.keys(rule.when)) words.add(`when.${key}`);
      for (const fact of Array.isArray(rule.when.facts) ? rule.when.facts : []) ask('fact', fact);
    }
    if (rule.from !== undefined) ask('derive', rule.from);
    if (rule.enter !== undefined) words.add(`enter:${String(rule.enter)}`);
    if (typeof rule.default === 'string') words.add(`default:${rule.default.split(':')[0]}`);
  }
  return [...words];
}

/** Every word a declaration reads, in `tableWords`' spelling. */
export function readsWords(reads: BehaviourReads): Set<string> {
  const words = new Set<string>();
  for (const key of reads.table ?? []) words.add(`table.${key}`);
  for (const v of reads.tables ?? []) words.add(`version:${v}`);
  for (const [kind, k] of Object.entries(reads.kinds ?? {})) {
    words.add(`kind:${kind}`);
    for (const key of k.spec ?? []) words.add(`kind:${kind}.${key}`);
    for (const name of k.facts ?? []) words.add(`fact:${kind}.${name}`);
    for (const name of k.derive ?? []) words.add(`derive:${kind}.${name}`);
  }
  for (const key of reads.rule ?? []) words.add(`rule.${key}`);
  for (const key of reads.when ?? []) words.add(`when.${key}`);
  for (const v of reads.enter ?? []) words.add(`enter:${v}`);
  for (const v of reads.default ?? []) words.add(`default:${v}`);
  return words;
}

/** The words of `raw` that `reads` does not read, in table order. */
export function unreadWords(raw: unknown, reads: BehaviourReads): string[] {
  const known = readsWords(reads);
  return tableWords(raw).filter((w) => !known.has(w));
}

/** A KEY word (`table.`, `rule.`, `kind:<kind>.<key>`) names where a value sits, not what a rule
 *  means: a runtime that does not read one ignores it and the rule still paints. A `when.` key is
 *  never one: a condition narrows when a look shows, so ignoring it would show the look where the
 *  author ruled it out - it is a meaning word, refused like a kind. */
const isKeyWord = (w: string) => /^(?:table\.|rule\.)/.test(w) || /^kind:[^.]+\./.test(w);

/** THE CHECK (C3) for one template's JS: its table against its own runtime.
 *  - `ok`: no table, or every word read; `ignored` lists KEY words no runtime this build emits
 *    reads either (an `axis`, a note), which change nothing on air and are only warned about;
 *  - `unread`: the words its runtime does not read that matter (`missing`): every meaning word
 *    (kind, fact, derivation, `enter` and `default` values, version), and every key word this
 *    build's runtime reads - a key a newer runtime acts on would do nothing under this one;
 *    `upgradable` when this build's runtime reads all of them, so importing again fixes it;
 *  - `unknown`: its READS is a version this build does not know, so it cannot judge;
 *  - `no-runtime`: a table and no runtime (the validator's existing pairing error). */
export type ReadsVerdict =
  | { status: 'ok'; ignored?: string[] }
  | { status: 'unread'; missing: string[]; upgradable: boolean; ignored?: string[] }
  | { status: 'unknown'; v: unknown }
  | { status: 'no-runtime' };

export function behaviourReadsVerdict(js: string): ReadsVerdict {
  if (!js.includes(TABLE_DECL)) return { status: 'ok' };
  const raw = jsonAfter(js, TABLE_DECL);
  if (raw === undefined) return { status: 'ok' };
  const runtime = readsOfRuntime(js);
  if (runtime.status === 'none') return { status: 'no-runtime' };
  if (runtime.status === 'unknown') return { status: 'unknown', v: runtime.v };
  const now = readsWords(runtimeReads(true));
  // The keys of a kind the runtime does not read at all are said by that kind's own word.
  const unread = unreadWords(raw, runtime.reads).filter((w, _, all) => {
    const kind = /^kind:([^.]+)\./.exec(w);
    return !kind || !all.includes(`kind:${kind[1]}`);
  });
  const ignored = unread.filter((w) => isKeyWord(w) && !now.has(w));
  const missing = unread.filter((w) => !ignored.includes(w));
  const also = ignored.length ? { ignored } : {};
  if (missing.length === 0) return { status: 'ok', ...also };
  return { status: 'unread', missing, upgradable: missing.every((w) => now.has(w)), ...also };
}
