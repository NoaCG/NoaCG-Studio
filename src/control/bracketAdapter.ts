// THE BRACKET ADAPTER (docs/work-specs/obs-scenes/spec.md, OS5b; AC-10, rules B1 to B22 in its
// phase notes). A pure module: a JSON source NoaCG reads may name it in `config.adapter`, and each
// read's payload is turned into one bracket shape before the shared evaluator sees it
// (./jsonSource.ts `projectJson`, OS5a's `project` hook, R11).
//
// The field mapping (which field of a row means a name, a score, a round) is the source's
// setting, never code: no site's field names are written here. Rows come as a list or as an
// object keyed by row number, and both give the same result. What the rows do not say is
// reported, never guessed: an unknown score is null, a missing row is said, a duplicated match
// that disagrees with itself keeps its values.
//
// The current match is the operator's (`<p>.currentMatchId`, in the tree). A read never moves it:
// `current` follows the pick, and holds (`held` true, every other value kept) when its match
// disappears or its players change.
//
// ES2020, no DOM; Node-importable: scripts/bracket-adapter.test.mjs drives it.

import { atPath, isObject, PATH, SEGMENT, type JsonValue } from './externalSource.js';
import { scalarText } from './sourceMapping.js';
import { sourcePrefix } from '../model/productionData.js';

export const BRACKET_ADAPTER_VERSION = 1;

/** What a row's field may mean (B1). The side keys (`name` to `league`) are a side row's (B17). */
export const BRACKET_FIELD_KEYS = [
  'bracket',
  'bracketTitle',
  'stage',
  'round',
  'roundName',
  'match',
  'status',
  'aName',
  'aRace',
  'aSeed',
  'aScore',
  'aLeague',
  'bName',
  'bRace',
  'bSeed',
  'bScore',
  'bLeague',
  'name',
  'race',
  'seed',
  'score',
  'league',
] as const;
export type BracketFieldKey = (typeof BRACKET_FIELD_KEYS)[number];
const GROUP_KEYS: readonly BracketFieldKey[] = ['bracket', 'bracketTitle', 'stage', 'round', 'roundName', 'match', 'status'];
/** The fields a row may map, by what a row is: a whole match (B1), or one side of one (B17). */
export const FIELDS_FOR: Record<'matches' | 'sides', readonly BracketFieldKey[]> = {
  matches: [...GROUP_KEYS, 'aName', 'aRace', 'aSeed', 'aScore', 'aLeague', 'bName', 'bRace', 'bSeed', 'bScore', 'bLeague'],
  sides: [...GROUP_KEYS, 'name', 'race', 'seed', 'score', 'league'],
};
/** What a players section's entry may map (B20). */
export const PLAYER_FIELD_KEYS = ['name', 'race', 'seed', 'league'] as const;
export type PlayerFieldKey = (typeof PLAYER_FIELD_KEYS)[number];

export interface BracketAdapter {
  v: 1;
  name: 'bracket';
  /** The dotted path of the rows in the payload; empty: the payload itself. A `*` segment gathers
   *  every entry of a list or of an object keyed by number, in feed order (B18). */
  rows: string;
  /** Meaning -> the dotted path inside a row that holds it. */
  fields: Partial<Record<BracketFieldKey, string>>;
  /** Each row is one side of a match; absent: each row is a whole match (B17). */
  rowsAre?: 'sides';
  /** The bracket is the entry's position at this `*` of `rows`, counting from 1 (B19). */
  bracketLevel?: number;
  /** Rounds by their id as a number, highest or lowest first; absent: as the feed gives them
   *  (B22). A feed keyed by round number loses its own order when its JSON is read. */
  roundOrder?: 'ascending' | 'descending';
  /** A section of players beside the rows, joined to the sides by name (B20). */
  players?: { at: string; fields: Partial<Record<PlayerFieldKey, string>> & { name: string } };
}

export type AdapterRead =
  | { status: 'none' }
  | { status: 'ok'; adapter: BracketAdapter }
  | { status: 'invalid'; error: string }
  /** A later version: kept as it is, never applied. */
  | { status: 'read-only'; version: number };

/** A rows path: dotted keys, each a segment or `*`; empty for the whole answer. */
export const isRowsPath = (path: string): boolean => path === '' || path.split('.').every((seg) => seg === '*' || SEGMENT.test(seg));

/** A stored adapter setting, judged (B1, B17 to B20). Never throws. A setting without the later
 *  keys reads exactly as it always has. */
export function readSourceAdapter(raw: unknown): AdapterRead {
  if (raw === undefined || raw === null) return { status: 'none' };
  const no = (error: string): AdapterRead => ({ status: 'invalid', error });
  if (!isObject(raw)) return no('the adapter setting is not an object');
  if (typeof raw.v === 'number' && raw.v > BRACKET_ADAPTER_VERSION) return { status: 'read-only', version: raw.v };
  if (raw.v !== BRACKET_ADAPTER_VERSION) return no('the adapter setting has no version');
  if (raw.name !== 'bracket') return no('the only adapter is bracket');
  for (const key of Object.keys(raw)) if (!['v', 'name', 'rows', 'fields', 'rowsAre', 'bracketLevel', 'players', 'roundOrder'].includes(key)) return no(`the adapter setting has an unknown key ${key}`);
  const rows = raw.rows ?? '';
  if (typeof rows !== 'string' || !isRowsPath(rows)) return no('the rows must be a dotted path');
  if (raw.rowsAre !== undefined && raw.rowsAre !== 'sides') return no('rows are whole matches, or sides');
  const sides = raw.rowsAre === 'sides';
  if (!isObject(raw.fields)) return no('the adapter has no fields');
  const allowed = new Set<string>(FIELDS_FOR[sides ? 'sides' : 'matches']);
  const fields: Partial<Record<BracketFieldKey, string>> = {};
  for (const [key, path] of Object.entries(raw.fields)) {
    if (!allowed.has(key)) return no(`the adapter has an unknown field ${key}`);
    if (typeof path !== 'string' || !PATH.test(path)) return no(`the field ${key} must be a dotted path`);
    fields[key as BracketFieldKey] = path;
  }
  if (sides ? !fields.name || !fields.match : !fields.aName || !fields.bName) return no(sides ? 'a side row needs its name and its match id mapped' : 'both players’ names must be mapped');
  const stars = rows === '' ? 0 : rows.split('.').filter((seg) => seg === '*').length;
  const level = raw.bracketLevel;
  if (level !== undefined && (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > stars)) return no('the bracket level must name a * of the rows');
  if (level !== undefined && fields.bracket) return no('the bracket comes from a field or from a level, not both');
  if (raw.roundOrder !== undefined && raw.roundOrder !== 'ascending' && raw.roundOrder !== 'descending') return no('the round order is ascending or descending');
  let players: BracketAdapter['players'];
  if (raw.players !== undefined) {
    const pl = raw.players;
    if (!isObject(pl) || typeof pl.at !== 'string' || !(pl.at === '' || PATH.test(pl.at)) || !isObject(pl.fields)) return no('the players section needs a dotted path and fields');
    const pf: Partial<Record<PlayerFieldKey, string>> = {};
    for (const [key, path] of Object.entries(pl.fields)) {
      if (!(PLAYER_FIELD_KEYS as readonly string[]).includes(key)) return no(`the players section has an unknown field ${key}`);
      if (typeof path !== 'string' || !PATH.test(path)) return no(`the players field ${key} must be a dotted path`);
      pf[key as PlayerFieldKey] = path;
    }
    if (!pf.name) return no('the players section needs the name mapped');
    for (const key of Object.keys(pl)) if (key !== 'at' && key !== 'fields') return no(`the players section has an unknown key ${key}`);
    players = { at: pl.at, fields: pf as NonNullable<BracketAdapter['players']>['fields'] };
  }
  return {
    status: 'ok',
    adapter: {
      v: 1,
      name: 'bracket',
      rows,
      fields,
      ...(sides ? { rowsAre: 'sides' as const } : {}),
      ...(level !== undefined ? { bracketLevel: level as number } : {}),
      ...(players ? { players } : {}),
      ...(raw.roundOrder ? { roundOrder: raw.roundOrder as 'ascending' | 'descending' } : {}),
    },
  };
}

// ── The shape ────────────────────────────────────────────────────────────────────────────────

export type MatchStatus = 'pending' | 'live' | 'done' | 'unknown';
export type Scalar = string | number | boolean | null;
export interface BracketSide {
  name: string | null;
  race: Scalar;
  seed: Scalar;
  score: number | null;
}
export interface BracketMatch {
  id: string;
  status: MatchStatus;
  a: BracketSide;
  b: BracketSide;
}
/** A match the operator can pick, with words for the picker. */
export interface MatchChoice {
  id: string;
  label: string;
}

/** The reader's memory of the current match (B12): kept beside the snapshot, under a key no
 *  dotted path can take, written to no field. */
export const CURRENT_MEMORY_KEY = '#bracket.current';
export interface CurrentMemory {
  matchId: string;
  a: string | null;
  b: string | null;
}

/**
 * The memory the reader kept with its snapshot. With none (a fresh tree, or an older build held the
 * lease), what the bound `current` paths last showed stands in for it, when they name a match
 * (B12 amended).
 */
export function readCurrentMemory(previous: Readonly<Record<string, string>> | undefined, sourceId: string): CurrentMemory | null {
  const text = previous?.[CURRENT_MEMORY_KEY];
  if (typeof text !== 'string') {
    const at = `${sourcePrefix(sourceId, 'external')}.current.`;
    const matchId = previous?.[`${at}matchId`];
    if (!matchId) return null;
    const name = (side: string) => previous[`${at}${side}.name`] || null;
    return { matchId, a: name('a'), b: name('b') };
  }
  try {
    const m = JSON.parse(text) as unknown;
    if (!isObject(m) || typeof m.matchId !== 'string') return null;
    const name = (v: unknown) => (typeof v === 'string' ? v : null);
    return { matchId: m.matchId, a: name(m.a), b: name(m.b) };
  } catch {
    return null;
  }
}
export const currentMemoryText = (m: CurrentMemory): string => JSON.stringify({ matchId: m.matchId, a: m.a, b: m.b });

export interface BracketResult {
  /** The shape under the source's prefix, `null` where a value is unknown. */
  output: { [key: string]: JsonValue };
  /** What the rows did not say, in plain words. */
  report: string[];
  /** Every match, in feed order, for the picker (a match kept by B7 included). */
  matches: MatchChoice[];
  /** Absent when the pick is not known (the server tick, B13): nothing under `current`. */
  current?: {
    /** The memory to keep (`matchId` empty: no match). */
    memory: CurrentMemory;
    /** Why `current` is held, or null. */
    held: string | null;
  };
}

// ── Reading the rows ─────────────────────────────────────────────────────────────────────────

/** A scalar as text, trimmed; null for anything else or empty. Also the operator's pick as the
 *  tree holds it. */
export function pickOf(value: unknown): string | null {
  return scalarText(value)?.trim() || null;
}
const text = pickOf;
/** A scalar as the feed gave it (B6), else null. */
function scalar(value: unknown): Scalar {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return typeof value === 'boolean' ? value : text(value);
}
const ROW_NUMBER = /^\d+$/;
/** What a dotted path names in a payload; the empty path is the payload itself. */
const valueAt = (payload: unknown, path: string): unknown => (path === '' ? payload : isObject(payload) ? atPath(payload as JsonValue, path) : undefined);
/** A score: a finite number, or a numeric string as its number; never a silent zero (B6). */
export function scoreOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^\s*-?\d+(?:\.\d+)?\s*$/.test(value)) return Number(value);
  return null;
}
export function statusOf(value: unknown): MatchStatus {
  const t = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return t === 'pending' || t === 'live' || t === 'done' ? t : 'unknown';
}

interface Gathered {
  label: string;
  row: Record<string, unknown>;
  /** The entry's position at each `*` of the rows path: a list's from 1, an object's key. */
  at: string[];
}

/** One container's rows in order, each named, and what was missing (B3). `where` names the
 *  container in a nested gather; empty for the plain path, whose words are as they always were. */
function rowsIn(at: unknown, where: string, positions: string[]): { rows: Gathered[]; report: string[] } | null {
  const name = (n: string | number) => (where === '' ? `row ${n}` : `row ${where}.${n}`);
  const report: string[] = [];
  const rows: Gathered[] = [];
  if (Array.isArray(at)) {
    at.forEach((row, i) => {
      if (isObject(row)) rows.push({ label: name(i + 1), row, at: positions });
      else report.push(`${name(i + 1)} is empty`);
    });
    return { rows, report };
  }
  if (!isObject(at)) return null;
  const numbered = numberedEntries(at, (key) => report.push(`${name(`“${key}”`)} has no row number, so it is left out`));
  for (let i = 0; i < numbered.length; i += 1) {
    const [n, key, row] = numbered[i];
    // One line per gap, never one per number: a feed's row numbers can be far apart.
    const from = i > 0 ? numbered[i - 1][0] + 1 : n;
    if (n - from === 1) report.push(`${name(from)} is missing`);
    else if (n - from > 1) report.push(`${where === '' ? 'rows' : `rows ${where}.`}${where === '' ? ` ${from}` : from} to ${n - 1} are missing`);
    if (isObject(row)) rows.push({ label: name(key), row, at: positions });
    else report.push(`${name(key)} is empty`);
  }
  return { rows, report };
}

/** An object's entries keyed by a whole number, in numeric order; any other key is told. */
function numberedEntries(at: Record<string, unknown>, other: (key: string) => void): [number, string, unknown][] {
  const numbered: [number, string, unknown][] = [];
  for (const [key, row] of Object.entries(at)) {
    if (!ROW_NUMBER.test(key) || !Number.isSafeInteger(Number(key))) other(key);
    else numbered.push([Number(key), key, row]);
  }
  return numbered.sort((x, y) => x[0] - y[0]);
}

/**
 * Every row the rows path names, in feed order (B3, B18). A `*` gathers each entry of a list (its
 * position counted from 1) or of an object keyed by number (its key), and each entry's position is
 * kept for the bracket level (B19). A branch without the next key is said, never filled in.
 */
function gatherRows(payload: unknown, path: string): { rows: Gathered[]; report: string[] } | { problem: string } {
  const segs = path === '' ? [] : path.split('.');
  if (!segs.includes('*')) {
    const at = valueAt(payload, path);
    const where = path === '' ? 'the answer' : path;
    const read = rowsIn(at, '', []);
    return read ?? { problem: at === undefined ? `${where} is not in the JSON` : `${where} holds no rows` };
  }
  const rows: Gathered[] = [];
  const report: string[] = [];
  let containers = 0;
  const walk = (value: unknown, i: number, positions: string[], where: string[]) => {
    const here = where.join('.') || 'the answer';
    if (i === segs.length) {
      const read = rowsIn(value, here, positions);
      if (!read) return report.push(`${here} holds no rows`);
      containers += 1;
      rows.push(...read.rows);
      report.push(...read.report);
      return;
    }
    const seg = segs[i];
    if (seg !== '*') {
      if (!isObject(value) || !Object.prototype.hasOwnProperty.call(value, seg)) return report.push(`${here} has no ${seg}`);
      return walk(value[seg], i + 1, positions, [...where, seg]);
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return report.push(`${here} has no entries`);
      return value.forEach((entry, n) => walk(entry, i + 1, [...positions, String(n + 1)], [...where, String(n + 1)]));
    }
    if (!isObject(value)) return report.push(`${here} holds no entries`);
    const numbered = numberedEntries(value, (key) => report.push(`${here}.“${key}” has no number, so it is left out`));
    if (numbered.length === 0) return report.push(`${here} has no entries`);
    for (const [, key, entry] of numbered) walk(entry, i + 1, [...positions, key], [...where, key]);
  };
  walk(payload, 0, [], []);
  if (containers === 0) return { problem: report[0] ?? `${path} holds no rows` };
  return { rows, report };
}

const tieCell = (value: string): string => value.replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
const sideCell = (side: BracketSide): string => tieCell([side.name ?? '', side.score === null ? '—' : String(side.score)].filter((p) => p !== '').join(' '));
/** One tie line as the Bracket type takes it (B9). */
export const tieLine = (round: string, m: Pick<BracketMatch, 'a' | 'b'>): string => `${tieCell(round)} | ${sideCell(m.a)} | ${sideCell(m.b)}`;
/** A bracket id as one path segment (B9). */
export const tieKey = (id: string, index: number): string => {
  const key = id.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  // Digits alone would be an array index to the tree (B4 amended).
  return key === '' ? indexKey(index) : /^\d+$/.test(key) ? `_${key}` : key;
};

interface Round {
  id: string;
  name: string;
  matches: (BracketMatch | { id: string; kept: true })[];
}
interface Stage {
  id: string;
  rounds: Map<string, Round>;
}
interface Bracket {
  id: string;
  title: string;
  stages: Map<string, Stage>;
  /** A match of it keeps its values (B7): its tie lines keep theirs. */
  kept: boolean;
}

/** An index as a path segment: `_0`, `_1`, ... A segment of digits alone is an array index to the
 *  production tree, which no source write can address (B4 amended). */
export const indexKey = (i: number): string => `_${i}`;
const indexed = <T>(items: T[], each: (item: T) => JsonValue): { [key: string]: JsonValue } => Object.fromEntries(items.map((item, i) => [indexKey(i), each(item)]));
const sideJson = (s: BracketSide): JsonValue => ({ name: s.name, race: s.race, seed: s.seed, score: s.score });

type SideL = BracketSide & { league: Scalar };
/** One match as the rows give it, before it is placed. `kept`: its rows disagree (B7, B17). */
interface Entry {
  label: string;
  bracketId: string;
  stageId: string;
  roundId: string;
  roundName: string | null;
  title: string | null;
  explicitId: string | undefined;
  status: MatchStatus;
  a: SideL;
  b: SideL;
  kept?: true;
}

/** A section's entries in order: a list, or an object's values by any key; null for anything else. */
const valuesOf = (value: unknown): unknown[] | null => (Array.isArray(value) ? value : isObject(value) ? Object.values(value) : null);

/** The players section's entries in order (B20): a list, or an object of entries by any key. */
function playersIn(payload: unknown, setting: NonNullable<BracketAdapter['players']>): { players: { name: string | null; race: Scalar; seed: Scalar; league: Scalar }[]; report: string[] } | { problem: string } {
  const at = valueAt(payload, setting.at);
  const where = setting.at === '' ? 'the answer' : setting.at;
  const list = valuesOf(at);
  if (!list) return { problem: at === undefined ? `the players list (${where}) is not in the JSON` : `the players list (${where}) holds no players` };
  const pick = (entry: Record<string, unknown>, key: PlayerFieldKey) => (setting.fields[key] ? atPath(entry as JsonValue, setting.fields[key]!) : undefined);
  const players: { name: string | null; race: Scalar; seed: Scalar; league: Scalar }[] = [];
  const report: string[] = [];
  list.forEach((entry, i) => {
    // An entry with no name keeps its place, so the entries after it keep theirs.
    const name = isObject(entry) ? text(pick(entry, 'name')) : null;
    if (name === null) report.push(`entry ${i + 1} of the players list has no name`);
    const at = isObject(entry) ? entry : {};
    players.push({ name, race: scalar(pick(at, 'race')), seed: scalar(pick(at, 'seed')), league: scalar(pick(at, 'league')) });
  });
  return { players, report };
}

/**
 * Turn one payload into the bracket shape (B3 to B12). `current` is the operator's pick and the
 * reader's memory; without it (the server tick) nothing is said under `current`. Pure.
 */
export function adaptBracket(
  payload: unknown,
  adapter: BracketAdapter,
  current?: { pick: string | null; memory: CurrentMemory | null },
): BracketResult | { problem: string } {
  const read = gatherRows(payload, adapter.rows);
  if ('problem' in read) return read;
  const report = [...read.report];
  const f = adapter.fields;
  const field = (row: Record<string, unknown>, key: BracketFieldKey): unknown => (f[key] ? atPath(row as JsonValue, f[key]!) : undefined);
  const groupOf = (g: Gathered, key: 'bracket' | 'stage' | 'round'): string | null =>
    key === 'bracket' && adapter.bracketLevel ? g.at[adapter.bracketLevel - 1] : f[key] ? text(field(g.row, key)) : '1';
  const sideOf = (row: Record<string, unknown>, keys: { name: BracketFieldKey; race: BracketFieldKey; seed: BracketFieldKey; score: BracketFieldKey; league: BracketFieldKey }): SideL => ({
    name: text(field(row, keys.name)),
    race: scalar(field(row, keys.race)),
    seed: scalar(field(row, keys.seed)),
    score: scoreOf(field(row, keys.score)),
    league: scalar(field(row, keys.league)),
  });
  const A = { name: 'aName', race: 'aRace', seed: 'aSeed', score: 'aScore', league: 'aLeague' } as const;
  const B = { name: 'bName', race: 'bRace', seed: 'bSeed', score: 'bScore', league: 'bLeague' } as const;
  const ONE = { name: 'name', race: 'race', seed: 'seed', score: 'score', league: 'league' } as const;
  const EMPTY: SideL = { name: null, race: null, seed: null, score: null, league: null };

  /** One match as the rows give it, before it is placed. */
  const entryOf = (g: Gathered, a: SideL, b: SideL): Entry | null => {
    const bracketId = groupOf(g, 'bracket');
    const stageId = groupOf(g, 'stage');
    const roundId = groupOf(g, 'round');
    const missing = [...(bracketId === null ? ['bracket'] : []), ...(stageId === null ? ['stage'] : []), ...(roundId === null ? ['round'] : [])];
    const explicitId = f.match ? text(field(g.row, 'match')) : undefined;
    if (explicitId === null) missing.push('match id');
    if (missing.length > 0) {
      report.push(`${g.label} has no ${missing.join(', ')}, so it is left out`);
      return null;
    }
    return {
      label: g.label,
      bracketId: bracketId!,
      stageId: stageId!,
      roundId: roundId!,
      roundName: f.roundName ? text(field(g.row, 'roundName')) : null,
      title: f.bracketTitle ? text(field(g.row, 'bracketTitle')) : null,
      explicitId: explicitId ?? undefined,
      status: f.status ? statusOf(field(g.row, 'status')) : 'unknown',
      a,
      b,
    };
  };

  const entries: Entry[] = [];
  if (adapter.rowsAre !== 'sides') {
    for (const g of read.rows) {
      const e = entryOf(g, sideOf(g.row, A), sideOf(g.row, B));
      if (e) entries.push(e);
    }
  } else {
    // One row is one side (B17): the rows of one match id, in feed order, are side a then side b.
    const byMatch = new Map<string, Gathered[]>();
    for (const g of read.rows) {
      const id = text(field(g.row, 'match'));
      if (id === null) {
        report.push(`${g.label} has no match id, so it is left out`);
        continue;
      }
      byMatch.set(id, [...(byMatch.get(id) ?? []), g]);
    }
    for (const [id, all] of byMatch) {
      // The same side row twice is one side, said (B7, B17): never a match against itself.
      const said = new Set<string>();
      const rows = all.filter((g) => {
        // A bracket taken from a row's place is part of what the row says (B19).
        const key = JSON.stringify([adapter.bracketLevel ? g.at[adapter.bracketLevel - 1] : null, ...FIELDS_FOR.sides.map((k) => field(g.row, k) ?? null)]);
        if (!said.has(key)) return said.add(key);
        report.push(`${g.label} repeats a side of match ${id}, so it is left out`);
        return false;
      });
      const placed = rows.map((g) => entryOf(g, EMPTY, EMPTY));
      if (placed.some((e) => e === null)) {
        if (rows.length > 1) report.push(`match ${id} is left out with that row`);
        continue;
      }
      // Names and titles may be on one side only: the first given is the match's.
      const first = { ...placed[0]!, roundName: placed.find((e) => e!.roundName)?.roundName ?? null, title: placed.find((e) => e!.title)?.title ?? null };
      const where = (e: Entry) => JSON.stringify([e.bracketId, e.stageId, e.roundId, e.status]);
      if (rows.length > 2) {
        report.push(`match ${id} has ${rows.length} rows, so it keeps its values`);
        entries.push({ ...first, kept: true });
        continue;
      }
      if (placed.some((e) => where(e!) !== where(first))) {
        report.push(`the two sides of match ${id} disagree about where it is, so it keeps its values`);
        entries.push({ ...first, kept: true });
        continue;
      }
      // A match with one known side is real (a bye, a slot not yet filled): never a winner (B17).
      if (rows.length === 1) report.push(`match ${id} has one side in the rows`);
      entries.push({ ...first, a: sideOf(rows[0].row, ONE), b: rows[1] ? sideOf(rows[1].row, ONE) : EMPTY });
    }
  }

  const brackets = new Map<string, Bracket>();
  const byId = new Map<string, { match: BracketMatch | { id: string; kept: true }; round: Round; bracket: Bracket; seen: unknown[]; label: string }>();
  const players = new Map<string, { name: string; race: Scalar; seed: Scalar; league: Scalar; clash: Set<string> }>();
  /** Each side as placed, for the players section's join (B20). */
  const placedSides: { side: BracketSide; league: Scalar }[] = [];
  for (const e of entries) {
    let bracket = brackets.get(e.bracketId);
    if (!bracket) {
      bracket = { id: e.bracketId, title: e.title || e.bracketId, stages: new Map(), kept: false };
      brackets.set(e.bracketId, bracket);
    }
    let stage = bracket.stages.get(e.stageId);
    if (!stage) {
      stage = { id: e.stageId, rounds: new Map() };
      bracket.stages.set(e.stageId, stage);
    }
    let round = stage.rounds.get(e.roundId);
    if (!round) {
      round = { id: e.roundId, name: e.roundName || e.roundId, matches: [] };
      stage.rounds.set(e.roundId, round);
    }
    const id = e.explicitId ?? `${e.bracketId}:${e.stageId}:${e.roundId}:${round.matches.length + 1}`;
    if (e.kept) {
      const kept = { id, kept: true as const };
      round.matches.push(kept);
      bracket.kept = true;
      byId.set(id, { match: kept, round, bracket, seen: [], label: e.label });
      continue;
    }
    const { league: aLeague, ...aSide } = e.a;
    const { league: bLeague, ...bSide } = e.b;
    const match: BracketMatch = { id, status: e.status, a: aSide, b: bSide };
    // What a row says of its match, compared only when a match id comes again.
    const seen = [e.bracketId, e.stageId, e.roundId, match, aLeague, bLeague, e.roundName, e.title];
    const before = byId.get(id);
    if (before) {
      if (JSON.stringify(before.seen) === JSON.stringify(seen)) report.push(`${e.label} repeats match ${id}, so it is left out`);
      else {
        report.push(`${before.label} and ${e.label} both give match ${id} with other values, so it keeps its values`);
        if (!('kept' in before.match)) {
          const slot = before.round.matches.indexOf(before.match);
          const kept = { id, kept: true as const };
          before.round.matches[slot] = kept;
          before.match = kept;
          before.bracket.kept = true;
        }
      }
      continue;
    }
    round.matches.push(match);
    byId.set(id, { match, round, bracket, seen, label: e.label });
    placedSides.push({ side: aSide, league: aLeague }, { side: bSide, league: bLeague });
    for (const s of [e.a, e.b]) {
      if (s.name === null) continue;
      const p = players.get(s.name);
      if (!p) {
        players.set(s.name, { name: s.name, race: s.race, seed: s.seed, league: s.league, clash: new Set() });
        continue;
      }
      for (const key of ['race', 'seed', 'league'] as const) {
        if (p[key] === null && !p.clash.has(key)) p[key] = s[key];
        else if (s[key] !== null && p[key] !== s[key]) {
          if (!p.clash.has(key)) report.push(`${s.name} has two values for ${key}, so it is left empty`);
          p.clash.add(key);
          p[key] = null;
        }
      }
    }
  }

  // The players section (B20): joined to every side by name, any case; it fills a seed, and a race
  // a side does not give, and it is `players` when mapped. A name it does not hold is said.
  let section: { name: string | null; race: Scalar; seed: Scalar; league: Scalar }[] | null = null;
  /** A mapped section this read cannot give: `players` is left out, so its paths keep their values. */
  let sectionGone = false;
  if (adapter.players) {
    const read = playersIn(payload, adapter.players);
    if ('problem' in read) {
      report.push(read.problem);
      sectionGone = true;
    } else {
      section = read.players;
      report.push(...read.report);
      // Names that differ only in case and say different things: neither is guessed (as B8).
      const byName = new Map<string, (typeof read.players)[number] | 'clash'>();
      for (const p of read.players) {
        if (p.name === null) continue;
        const key = p.name.toLowerCase();
        const before = byName.get(key);
        if (before === undefined) byName.set(key, p);
        else if (before !== 'clash' && JSON.stringify([before.race, before.seed, before.league]) !== JSON.stringify([p.race, p.seed, p.league])) {
          report.push(`the players list gives ${p.name} twice with other values, so it fills nothing for that name`);
          byName.set(key, 'clash');
        }
      }
      const unknown = new Set<string>();
      for (const { side } of placedSides) {
        if (side.name === null) continue;
        const p = byName.get(side.name.toLowerCase());
        if (p === 'clash') continue;
        if (!p) {
          if (!unknown.has(side.name)) report.push(`${side.name} is not in the players list`);
          unknown.add(side.name);
          continue;
        }
        if (side.seed === null) side.seed = p.seed;
        if (side.race === null) side.race = p.race;
      }
    }
  }

  // Rounds by their number when the setting asks (B22): a round whose id is not a number keeps
  // its feed place after the numbered ones.
  if (adapter.roundOrder) {
    const sign = adapter.roundOrder === 'ascending' ? 1 : -1;
    const num = (id: string) => (/^\s*-?\d+(?:\.\d+)?\s*$/.test(id) ? Number(id) : null);
    for (const bracket of brackets.values()) {
      for (const stage of bracket.stages.values()) {
        const rounds = [...stage.rounds.values()];
        const numbered = rounds.filter((r) => num(r.id) !== null).sort((x, y) => sign * (num(x.id)! - num(y.id)!));
        stage.rounds = new Map([...numbered, ...rounds.filter((r) => num(r.id) === null)].map((r) => [r.id, r]));
      }
    }
  }
  const list = [...brackets.values()];
  // Built from entries, so a bracket id such as __proto__ is an own key like any other.
  const tieLines: [string, JsonValue][] = [];
  const keys = new Set<string>();
  list.forEach((bracket, i) => {
    const key = tieKey(bracket.id, i);
    if (keys.has(key)) {
      report.push(`bracket ${bracket.id} has the same tie key as another, so it has no tie lines`);
      return;
    }
    keys.add(key);
    // A held bracket's ties are left out entirely: its field keeps its lines.
    if (bracket.kept) return;
    const lines: string[] = [];
    // The Bracket type groups rounds by name: two stages' rounds are told apart by their stage.
    const staged = bracket.stages.size > 1;
    for (const stage of bracket.stages.values()) {
      for (const round of stage.rounds.values()) for (const m of round.matches) if (!('kept' in m)) lines.push(tieLine(staged ? `${stage.id} ${round.name}` : round.name, m));
    }
    tieLines.push([key, lines.join('\n')]);
  });

  const matches: MatchChoice[] = [];
  const bracketsJson = indexed(list, (bracket) => ({
    id: bracket.id,
    title: bracket.title,
    stages: indexed([...bracket.stages.values()], (stage) => ({
      id: stage.id,
      rounds: indexed([...stage.rounds.values()], (round) => ({
        id: round.id,
        name: round.name,
        matches: indexed(round.matches, (m): JsonValue => {
          if ('kept' in m) {
            matches.push({ id: m.id, label: `${round.name}: ${m.id}` });
            return { id: m.id };
          }
          matches.push({ id: m.id, label: `${round.name}: ${m.a.name ?? '?'} v ${m.b.name ?? '?'}` });
          return { id: m.id, status: m.status, a: sideJson(m.a), b: sideJson(m.b) };
        }),
      })),
    })),
  }));

  // Positional ids move when a row is inserted: no current match without a match field (B5).
  if (!f.match && entries.length > 0) report.unshift('no match id is mapped, so matches are known by their place and there is no current match');
  const output: { [key: string]: JsonValue } = {};
  let resolved: BracketResult['current'];
  if (current && f.match) {
    const r = resolveCurrent(current.pick, current.memory, (id) => {
      const at = byId.get(id);
      if (!at) return null;
      return 'kept' in at.match ? { kept: true as const } : { match: at.match, round: at.round.name };
    });
    resolved = { memory: r.memory, held: r.held };
    if (r.current) output.current = r.current;
  }
  output.ties = Object.fromEntries(tieLines);
  output.brackets = bracketsJson;
  if (!sectionGone) output.players = indexed(section ?? [...players.values()], (p) => ({ name: p.name, race: p.race, seed: p.seed, league: p.league }));
  return { output, report, matches, ...(resolved ? { current: resolved } : {}) };
}

/**
 * The current match's rule (B12), on its own so a test can hold it to a model. `find` answers the
 * pick's match as this read gives it, or null when it is gone or kept by B7.
 */
export function resolveCurrent(
  pick: string | null,
  memory: CurrentMemory | null,
  /** `kept`: two rows disagree about it (B7). */
  find: (id: string) => { match: BracketMatch; round: string } | { kept: true } | null,
): { current: { [key: string]: JsonValue } | null; memory: CurrentMemory; held: string | null } {
  // No pick: the memory forgets the match but stays, so a later pick is fresh and never compared
  // with what the fields showed before it (B12).
  if (pick === null) return { current: null, memory: { matchId: '', a: null, b: null }, held: null };
  const found = find(pick);
  const fresh = memory === null || memory.matchId !== pick;
  if (!found || 'kept' in found) {
    const why = found ? `match ${pick} is given twice with other values` : `match ${pick} is not in the feed`;
    return { current: { held: true }, memory: fresh ? { matchId: pick, a: null, b: null } : memory, held: why };
  }
  const { match, round } = found;
  if (!fresh) {
    const changed = (was: string | null, now: string | null) => was !== null && was !== now;
    if (changed(memory!.a, match.a.name) || changed(memory!.b, match.b.name)) {
      return { current: { held: true }, memory, held: `match ${pick} now has other players` };
    }
  }
  const next: CurrentMemory = fresh ? { matchId: pick, a: match.a.name, b: match.b.name } : { matchId: pick, a: memory!.a ?? match.a.name, b: memory!.b ?? match.b.name };
  return {
    current: { matchId: match.id, round, a: sideJson(match.a), b: sideJson(match.b), held: false },
    memory: next,
    held: null,
  };
}

/** Where the operator's pick lives in the production's tree (B11). */
export const currentMatchPath = (sourceId: string): string => `${sourcePrefix(sourceId, 'external')}.currentMatchId`;

/** The adapter's output with every unknown value as empty text (B10): what fields are given. */
export function forFields(value: JsonValue): JsonValue {
  if (value === null) return '';
  if (Array.isArray(value)) return value.map(forFields);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, forFields(v)]));
  return value;
}

// ── For the reader (OS5a's `project` hook, R11) ─────────────────────────────────────────────

/** At most this many of an adapter's report lines go on the line (B15). */
export const ADAPTER_REPORT_LINES = 5;
/** At most this many matches are offered to the picker (B16). */
export const MAX_CHOICES = 200;

/** What a source's adapter makes of one payload, for the shared evaluator. */
export interface ReaderAdapted {
  /** What the evaluator reads: the adapter's shape as field text, or the payload as it came. */
  payload: unknown;
  /** The adapter's lines for the source's line. */
  said: string[];
  /** The memory to keep with the snapshot, when the pick was known. */
  memory?: Record<string, string | null>;
  /** The picker's matches; null offers none. */
  choices: MatchChoice[] | null;
  /** A bound leaf the adapter leaves out on purpose, never reported missing: the operator's pick
   *  (B11), and `current` while it holds or the pick is not known. */
  own: (leaf: string) => boolean;
}

/**
 * A source's adapter applied to one payload (B1). `setting` is `config.adapter` as stored; with
 * none the payload passes as it is. `hold`: nothing can be read, every value holds, and why.
 * Without `current` (the server tick) nothing under `current` is said (B13).
 */
export function adaptForReader(
  sourceId: string,
  payload: unknown,
  setting: unknown,
  /** `fresh`: the operator picked since the last read here, so the pick is taken as new whatever
   *  the memory says (B14 after review). */
  current?: { pick: unknown; previous: Readonly<Record<string, string>>; fresh?: boolean },
): ReaderAdapted | { hold: string } {
  const read = readSourceAdapter(setting);
  if (read.status === 'none') return { payload, said: [], choices: null, own: () => false };
  if (read.status !== 'ok') {
    const why = read.status === 'invalid' ? read.error : `the adapter is version ${read.version}; this build reads version ${BRACKET_ADAPTER_VERSION}, so it is held read-only`;
    return { hold: `the adapter cannot be used (${why}), so every value holds` };
  }
  const adapted = adaptBracket(payload, read.adapter, current ? { pick: pickOf(current.pick), memory: current.fresh ? null : readCurrentMemory(current.previous, sourceId) } : undefined);
  if ('problem' in adapted) return { hold: `the bracket cannot be read (${adapted.problem}), so every value holds` };
  const said: string[] = [];
  let choices: MatchChoice[] | null = null;
  // A pick needs a match id the rows give (B5 amended).
  if (read.adapter.fields.match) {
    choices = adapted.matches.slice(0, MAX_CHOICES);
    if (adapted.matches.length > MAX_CHOICES) said.push(`only the first ${MAX_CHOICES} of ${adapted.matches.length} matches can be picked here`);
  }
  said.push(...adapted.report.slice(0, ADAPTER_REPORT_LINES));
  if (adapted.report.length > ADAPTER_REPORT_LINES) said.push(`and ${adapted.report.length - ADAPTER_REPORT_LINES} more in the rows`);
  if (adapted.current?.held) said.push(`the current match is held: ${adapted.current.held}, so it keeps its values`);
  return {
    payload: forFields(adapted.output),
    said,
    ...(adapted.current ? { memory: { [CURRENT_MEMORY_KEY]: currentMemoryText(adapted.current.memory) } } : {}),
    choices,
    own: (leaf) => leaf === 'currentMatchId' || leaf === 'current' || leaf.startsWith('current.'),
  };
}

// ── The Connect review (B2) ──────────────────────────────────────────────────────────────────

/** A list's entries, or an object's keyed by number, as the reader takes them: what a `*` steps
 *  through. */
const entriesOf = (value: unknown): unknown[] | null => {
  if (Array.isArray(value)) return value;
  if (!isObject(value)) return null;
  const numbered = numberedEntries(value, () => {});
  return numbered.length > 0 ? numbered.map(([, , entry]) => entry) : null;
};
/** An entry that can be a row: an object with at least one scalar. */
const rowLike = (value: unknown): boolean => isObject(value) && Object.values(value).some((v) => scalarText(v) !== null);

/**
 * Where a sample holds rows, nearest first: '' for the sample itself. A list, or an object keyed by
 * number, whose entries hold values is offered; and its entries are looked into through `*`, so
 * rows nested under such levels are found too (B18).
 */
export function bracketRowPaths(sample: unknown): string[] {
  const out: string[] = [];
  let visits = 0;
  const walk = (value: unknown, keys: string[]) => {
    if (keys.length > 8 || out.length >= 20 || (visits += 1) > 5_000) return;
    const entries = entriesOf(value);
    if (entries) {
      if (entries.some(rowLike)) out.push(keys.join('.'));
      // Through `*`: the first entries show what lies below.
      for (const entry of entries.slice(0, 3)) walk(entry, [...keys, '*']);
      return;
    }
    if (!isObject(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (!SEGMENT.test(key)) continue;
      if (isObject(child) || Array.isArray(child)) walk(child, [...keys, key]);
    }
  };
  walk(sample, []);
  return [...new Set(out)];
}

/** Where a sample holds a section of entries by any key, such as a players list (B20). */
export function bracketSectionPaths(sample: unknown): string[] {
  const out: string[] = [];
  const walk = (value: unknown, keys: string[]) => {
    if (!isObject(value) || keys.length >= 4 || out.length >= 20) return;
    for (const [key, child] of Object.entries(value)) {
      if (!SEGMENT.test(key)) continue;
      const at = [...keys, key];
      const list = valuesOf(child) ?? [];
      if (list.length > 0 && list.slice(0, 3).every(rowLike)) out.push(at.join('.'));
      else walk(child, at);
    }
  };
  walk(sample, []);
  return out;
}

/** The dotted paths of the scalars the first entries hold (two levels deep), in first appearance. */
function keysOf(list: unknown[]): string[] {
  const keys: string[] = [];
  const walk = (value: unknown, prefix: string[]) => {
    if (!isObject(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (!SEGMENT.test(key)) continue;
      const path = [...prefix, key].join('.');
      if (isObject(child) && prefix.length < 1) walk(child, [...prefix, key]);
      else if (!isObject(child) && !Array.isArray(child) && !keys.includes(path)) keys.push(path);
    }
  };
  for (const row of list.slice(0, 5)) walk(row, []);
  return keys;
}

/** The keys the first rows at a rows path hold. */
export function bracketRowKeys(sample: unknown, rows: string): string[] {
  const read = gatherRows(sample, rows);
  return 'problem' in read ? [] : keysOf(read.rows.map((g) => g.row));
}

/** The keys the first entries of a players section hold. */
export function bracketSectionKeys(sample: unknown, at: string): string[] {
  return keysOf(valuesOf(valueAt(sample, at)) ?? []);
}

/** What the review shows for a bracket source: the adapted sample, with the first match as the
 *  current one so its paths can be connected, every unknown value as empty text. */
export function bracketReviewSample(sample: unknown, adapter: BracketAdapter): { sample: JsonValue } | { problem: string } {
  const first = adaptBracket(sample, adapter);
  if ('problem' in first) return first;
  const pick = adapter.fields.match ? (first.matches[0]?.id ?? null) : null;
  const adapted = pick === null ? first : adaptBracket(sample, adapter, { pick, memory: null });
  if ('problem' in adapted) return adapted;
  return { sample: forFields(adapted.output) };
}
