// THE BRACKET ADAPTER (docs/work-specs/obs-scenes/spec.md, OS5b; AC-10, rules B1 to B15 in its
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

import { atPath, isObject, PATH, type JsonValue } from './externalSource.js';
import { sourcePrefix } from '../model/productionData.js';

export const BRACKET_ADAPTER_VERSION = 1;

/** What a row's field may mean (B1). */
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
] as const;
export type BracketFieldKey = (typeof BRACKET_FIELD_KEYS)[number];
const FIELD_KEYS = new Set<string>(BRACKET_FIELD_KEYS);

export interface BracketAdapter {
  v: 1;
  name: 'bracket';
  /** The dotted path of the rows in the payload; empty: the payload itself. */
  rows: string;
  /** Meaning -> the dotted path inside a row that holds it. */
  fields: Partial<Record<BracketFieldKey, string>> & { aName: string; bName: string };
}

export type AdapterRead =
  | { status: 'none' }
  | { status: 'ok'; adapter: BracketAdapter }
  | { status: 'invalid'; error: string }
  /** A later version: kept as it is, never applied. */
  | { status: 'read-only'; version: number };

/** A stored adapter setting, judged (B1). Never throws. */
export function readSourceAdapter(raw: unknown): AdapterRead {
  if (raw === undefined || raw === null) return { status: 'none' };
  const no = (error: string): AdapterRead => ({ status: 'invalid', error });
  if (!isObject(raw)) return no('the adapter setting is not an object');
  if (typeof raw.v === 'number' && raw.v > BRACKET_ADAPTER_VERSION) return { status: 'read-only', version: raw.v };
  if (raw.v !== BRACKET_ADAPTER_VERSION) return no('the adapter setting has no version');
  if (raw.name !== 'bracket') return no('the only adapter is bracket');
  for (const key of Object.keys(raw)) if (!['v', 'name', 'rows', 'fields'].includes(key)) return no(`the adapter setting has an unknown key ${key}`);
  const rows = raw.rows ?? '';
  if (typeof rows !== 'string' || (rows !== '' && !PATH.test(rows))) return no('the rows must be a dotted path');
  if (!isObject(raw.fields)) return no('the adapter has no fields');
  const fields: Partial<Record<BracketFieldKey, string>> = {};
  for (const [key, path] of Object.entries(raw.fields)) {
    if (!FIELD_KEYS.has(key)) return no(`the adapter has an unknown field ${key}`);
    if (typeof path !== 'string' || !PATH.test(path)) return no(`the field ${key} must be a dotted path`);
    fields[key as BracketFieldKey] = path;
  }
  if (!fields.aName || !fields.bName) return no('both players’ names must be mapped');
  return { status: 'ok', adapter: { v: 1, name: 'bracket', rows, fields: fields as BracketAdapter['fields'] } };
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

export function readCurrentMemory(previous: Readonly<Record<string, string>> | undefined): CurrentMemory | null {
  const text = previous?.[CURRENT_MEMORY_KEY];
  if (typeof text !== 'string') return null;
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
    /** The memory to keep: null clears it. */
    memory: CurrentMemory | null;
    /** Why `current` is held, or null. */
    held: string | null;
  };
}

// ── Reading the rows ─────────────────────────────────────────────────────────────────────────

/** A scalar as text, trimmed; null for anything else or empty. */
function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return null;
}
/** A scalar as the feed gave it (B6), else null. */
function scalar(value: unknown): Scalar {
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  return null;
}
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

/** The rows in order, each with the words that name it, and what was missing (B3). */
function rowsOf(payload: unknown, path: string): { rows: { label: string; row: Record<string, unknown> }[]; report: string[] } | { problem: string } {
  const at = path === '' ? payload : isObject(payload) ? atPath(payload as JsonValue, path) : undefined;
  const where = path === '' ? 'the answer' : path;
  const report: string[] = [];
  const rows: { label: string; row: Record<string, unknown> }[] = [];
  if (Array.isArray(at)) {
    at.forEach((row, i) => {
      if (isObject(row)) rows.push({ label: `row ${i + 1}`, row });
      else report.push(`row ${i + 1} is empty`);
    });
    return { rows, report };
  }
  if (!isObject(at)) return { problem: at === undefined ? `${where} is not in the JSON` : `${where} holds no rows` };
  const numbered: [number, string, unknown][] = [];
  for (const [key, row] of Object.entries(at)) {
    if (!/^\d+$/.test(key)) report.push(`row “${key}” has no row number, so it is left out`);
    else numbered.push([Number(key), key, row]);
  }
  numbered.sort((x, y) => x[0] - y[0]);
  for (let i = 0; i < numbered.length; i += 1) {
    const [n, key, row] = numbered[i];
    if (i > 0) for (let gap = numbered[i - 1][0] + 1; gap < n; gap += 1) report.push(`row ${gap} is missing`);
    if (isObject(row)) rows.push({ label: `row ${key}`, row });
    else report.push(`row ${key} is empty`);
  }
  return { rows, report };
}

const tieCell = (value: string): string => value.replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
const sideCell = (side: BracketSide): string => tieCell([side.name ?? '', side.score === null ? '—' : String(side.score)].filter((p) => p !== '').join(' '));
/** One tie line as the Bracket type takes it (B9). */
export const tieLine = (round: string, m: Pick<BracketMatch, 'a' | 'b'>): string => `${tieCell(round)} | ${sideCell(m.a)} | ${sideCell(m.b)}`;
/** A bracket id as one path segment (B9). */
export const tieKey = (id: string, index: number): string => id.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || String(index);

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

const indexed = <T>(items: T[], each: (item: T) => JsonValue): { [key: string]: JsonValue } => Object.fromEntries(items.map((item, i) => [String(i), each(item)]));
const sideJson = (s: BracketSide): JsonValue => ({ name: s.name, race: s.race, seed: s.seed, score: s.score });

/**
 * Turn one payload into the bracket shape (B3 to B12). `current` is the operator's pick and the
 * reader's memory; without it (the server tick) nothing is said under `current`. Pure.
 */
export function adaptBracket(
  payload: unknown,
  adapter: BracketAdapter,
  current?: { pick: string | null; memory: CurrentMemory | null },
): BracketResult | { problem: string } {
  const read = rowsOf(payload, adapter.rows);
  if ('problem' in read) return read;
  const report = [...read.report];
  const f = adapter.fields;
  const field = (row: Record<string, unknown>, key: BracketFieldKey): unknown => (f[key] ? atPath(row as JsonValue, f[key]!) : undefined);
  const group = (row: Record<string, unknown>, key: BracketFieldKey): string | null => (f[key] ? text(field(row, key)) : '1');
  const side = (row: Record<string, unknown>, s: 'a' | 'b'): BracketSide & { league: Scalar } => ({
    name: text(field(row, `${s}Name`)),
    race: scalar(field(row, `${s}Race`)),
    seed: scalar(field(row, `${s}Seed`)),
    score: scoreOf(field(row, `${s}Score`)),
    league: scalar(field(row, `${s}League`)),
  });

  const brackets = new Map<string, Bracket>();
  const byId = new Map<string, { match: BracketMatch | { id: string; kept: true }; round: Round; bracket: Bracket; seen: string; label: string }>();
  const players = new Map<string, { name: string; race: Scalar; seed: Scalar; league: Scalar; clash: Set<string> }>();
  for (const { label, row } of read.rows) {
    const bracketId = group(row, 'bracket');
    const stageId = group(row, 'stage');
    const roundId = group(row, 'round');
    const missing = [
      ...(bracketId === null ? ['bracket'] : []),
      ...(stageId === null ? ['stage'] : []),
      ...(roundId === null ? ['round'] : []),
    ];
    const explicitId = f.match ? text(field(row, 'match')) : undefined;
    if (explicitId === null) missing.push('match id');
    if (missing.length > 0) {
      report.push(`${label} has no ${missing.join(', ')}, so it is left out`);
      continue;
    }
    let bracket = brackets.get(bracketId!);
    if (!bracket) {
      bracket = { id: bracketId!, title: (f.bracketTitle && text(field(row, 'bracketTitle'))) || bracketId!, stages: new Map(), kept: false };
      brackets.set(bracketId!, bracket);
    }
    let stage = bracket.stages.get(stageId!);
    if (!stage) {
      stage = { id: stageId!, rounds: new Map() };
      bracket.stages.set(stageId!, stage);
    }
    let round = stage.rounds.get(roundId!);
    if (!round) {
      round = { id: roundId!, name: (f.roundName && text(field(row, 'roundName'))) || roundId!, matches: [] };
      stage.rounds.set(roundId!, round);
    }
    const a = side(row, 'a');
    const b = side(row, 'b');
    const id = explicitId ?? `${bracketId}:${stageId}:${roundId}:${round.matches.length + 1}`;
    const match: BracketMatch = { id, status: f.status ? statusOf(field(row, 'status')) : 'unknown', a: { name: a.name, race: a.race, seed: a.seed, score: a.score }, b: { name: b.name, race: b.race, seed: b.seed, score: b.score } };
    const seen = JSON.stringify([bracketId, stageId, roundId, match, a.league, b.league, f.roundName ? text(field(row, 'roundName')) : null, f.bracketTitle ? text(field(row, 'bracketTitle')) : null]);
    const before = byId.get(id);
    if (before) {
      if (before.seen === seen) report.push(`${label} repeats match ${id}, so it is left out`);
      else {
        report.push(`${before.label} and ${label} both give match ${id} with other values, so it keeps its values`);
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
    byId.set(id, { match, round, bracket, seen, label });
    for (const s of [a, b]) {
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

  const list = [...brackets.values()];
  const ties: { [key: string]: JsonValue } = {};
  list.forEach((bracket, i) => {
    const key = tieKey(bracket.id, i);
    if (key in ties) {
      report.push(`bracket ${bracket.id} has the same tie key as another, so it has no tie lines`);
      return;
    }
    if (bracket.kept) {
      ties[key] = null;
      return;
    }
    const lines: string[] = [];
    // The Bracket type groups rounds by name: two stages' rounds are told apart by their stage.
    const staged = bracket.stages.size > 1;
    for (const stage of bracket.stages.values()) {
      for (const round of stage.rounds.values()) for (const m of round.matches) if (!('kept' in m)) lines.push(tieLine(staged ? `${stage.id} ${round.name}` : round.name, m));
    }
    ties[key] = lines.join('\n');
  });
  // A held bracket's ties are left out entirely: its field keeps its lines.
  for (const key of Object.keys(ties)) if (ties[key] === null) delete ties[key];

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
  if (!f.match && read.rows.length > 0) report.push('no match id is mapped, so matches are known by their place and there is no current match');
  const output: { [key: string]: JsonValue } = {};
  let resolved: BracketResult['current'];
  if (current && f.match) {
    const r = resolveCurrent(current.pick, current.memory, (id) => {
      const at = byId.get(id);
      return at && !('kept' in at.match) ? { match: at.match, round: at.round.name } : null;
    });
    resolved = { memory: r.memory, held: r.held };
    if (r.current) output.current = r.current;
  }
  output.ties = ties;
  output.brackets = bracketsJson;
  output.players = indexed([...players.values()], (p) => ({ name: p.name, race: p.race, seed: p.seed, league: p.league }));
  return { output, report, matches, ...(resolved ? { current: resolved } : {}) };
}

/**
 * The current match's rule (B12), on its own so a test can hold it to a model. `find` answers the
 * pick's match as this read gives it, or null when it is gone or kept by B7.
 */
export function resolveCurrent(
  pick: string | null,
  memory: CurrentMemory | null,
  find: (id: string) => { match: BracketMatch; round: string } | null,
): { current: { [key: string]: JsonValue } | null; memory: CurrentMemory | null; held: string | null } {
  if (pick === null) return { current: null, memory: null, held: null };
  const found = find(pick);
  const fresh = memory === null || memory.matchId !== pick;
  if (!found) {
    return { current: { held: true }, memory: fresh ? { matchId: pick, a: null, b: null } : memory, held: `match ${pick} is not in the feed` };
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

/** The pick as the tree holds it: text, trimmed; null when absent or empty. */
export function pickOf(value: unknown): string | null {
  return text(value);
}

/** The adapter's output with every unknown value as empty text (B10): what fields are given. */
export function forFields(value: JsonValue): JsonValue {
  if (value === null) return '';
  if (Array.isArray(value)) return value.map(forFields);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, forFields(v)]));
  return value;
}

// ── The Connect review (B2) ──────────────────────────────────────────────────────────────────

/** Whether a value holds rows: a list of objects, or an object keyed by row number. */
const holdsRows = (value: unknown): boolean =>
  Array.isArray(value)
    ? value.length > 0 && value.some(isObject)
    : isObject(value) && Object.keys(value).length > 0 && Object.keys(value).every((k) => /^\d+$/.test(k)) && Object.values(value).some(isObject);

/** Where a sample holds rows, nearest first: '' for the sample itself. */
export function bracketRowPaths(sample: unknown): string[] {
  const out: string[] = [];
  if (holdsRows(sample)) out.push('');
  const walk = (value: unknown, keys: string[]) => {
    if (!isObject(value) || keys.length >= 4 || out.length >= 20) return;
    for (const [key, child] of Object.entries(value)) {
      if (!/^[A-Za-z0-9_-]+$/.test(key)) continue;
      const at = [...keys, key];
      if (holdsRows(child)) out.push(at.join('.'));
      else walk(child, at);
    }
  };
  if (!holdsRows(sample)) walk(sample, []);
  return out;
}

/** The dotted paths of the scalars the first rows hold (two levels deep), in first appearance. */
export function bracketRowKeys(sample: unknown, rows: string): string[] {
  const at = rows === '' ? sample : isObject(sample) ? atPath(sample as JsonValue, rows) : undefined;
  const list = Array.isArray(at) ? at : isObject(at) ? Object.values(at) : [];
  const keys: string[] = [];
  const walk = (value: unknown, prefix: string[]) => {
    if (!isObject(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (!/^[A-Za-z0-9_-]+$/.test(key)) continue;
      const path = [...prefix, key].join('.');
      if (isObject(child) && prefix.length < 1) walk(child, [...prefix, key]);
      else if (!isObject(child) && !Array.isArray(child) && !keys.includes(path)) keys.push(path);
    }
  };
  for (const row of list.slice(0, 5)) walk(row, []);
  return keys;
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
