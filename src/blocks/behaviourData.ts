// The BEHAVIOUR BINDING table, format version 1 (docs/SVG_BEHAVIOUR_PLAN.md §5).
//
// An imported graphic that carries behaviour carries two things beside its machine: ROLE STAMPS
// on the artwork's own nodes (`data-noacg-role="answer.selected/B"`), and this table, which says
// what each role means to the runtime - which field each role compiled to, what KIND each field
// is, and the PAINT RULES that decide when a drawn look shows, how a gauge is scaled and what a
// readout prints. The machine itself stays in NOACG_ANIM; this block never holds a state or an
// arrow. The one emitted paint runtime (templates/importedDesign/behaviourRuntime.ts) reads both.
//
// It lives in design-owned JS OUTSIDE the marked ANIMATION region, exactly like the growth table
// (NOACG_LAYOUT): the timeline rewrites that region and must never rewrite this. It is strict
// JSON inside the braces, so a hand edit in Advanced mode round-trips and the editor can read it
// back - `var NOACG_BEHAVIOUR = {...};` is the whole contract.
//
// VERSIONING follows docs/STATE_MACHINE_SCHEMA.md §5 to the letter: additive optional keys never
// bump `version`; a breaking change bumps it and migrates on read here; serialization always
// writes the current version; an unknown version parses to null and the template is read as
// hand-crafted behaviour (its own frozen runtime still runs it - nothing is lost, and nothing
// pretends to understand it).

/** The attribute a bound layer carries: one or more role TOKENS, space-separated, exactly like
 *  the growth stamp (`data-noacg-el`). A token is `role` for a graphic-level role or `role/KEY`
 *  for a row's. The runtime queries `[data-noacg-role~="token"]`, so a layer may play two roles
 *  without either stamp erasing the other. */
export const BEHAVIOUR_ROLE_ATTR = 'data-noacg-role';

export const BEHAVIOUR_VERSION = 1;

/** A role token: `question`, `answer/A`, `answer.selected/B`. Roles are lower-case words joined
 *  by dots; keys are the row's own key, upper-cased. */
export function roleToken(role: string, key?: string | null): string {
  return key ? `${role}/${key}` : role;
}

/**
 * When a drawn look shows. TWO SLOTS, EACH A LIST OF PICKS, one AND between them - and no
 * third slot into which a comparison could ever be typed (docs/SVG_BEHAVIOUR_PLAN.md §2d).
 *
 *  - `state`: any of these `group/state` pairs is the machine's current state.
 *  - `facts`: ALL of these `field:fact` tokens hold. A fact is a named truth the field's KIND
 *    exposes (`f6:picked`, `f3:is:closed`, `f1:warning`); a row-relative fact (`picked`,
 *    `unpicked`, `moved`, `leader`) is asked of the row the look belongs to.
 *
 * A condition with neither slot is always true.
 */
export interface BehaviourCondition {
  state?: string[];
  facts?: string[];
}

/** Show a drawn look while its condition holds. Several rules may name the SAME look; it shows
 *  when any of them holds (that is how "the figures show with the result, or live when the
 *  production asked" is two rules rather than an OR the grammar does not have). */
export interface LookRule {
  look: string;
  /** The row set this look repeats over, when it is one look per row. */
  rows?: string;
  when?: BehaviourCondition;
  /** A small platform pop when the look is (re)painted on by a state entry - a flash, a
   *  winner mark. Never on a data repaint: a bar that overshoots reads as the wrong figure. */
  enter?: 'pop';
  /** The platform treatment painted when the look's layer is absent for that row - the moment
   *  ladder's rung 1 (docs/SVG_STATES_FROM_ARTWORK.md): `row-highlight`, `row-mark:correct`,
   *  `row-mark:wrong`, `badge:<word>`. Absent = nothing shows when undrawn. */
  default?: string;
  /** The FIELD role the default is drawn around (the row's own text, and the panel behind it
   *  where the fit ladder finds one); absent = the whole artwork. */
  anchor?: string;
}

/** Scale a layer the designer drew at its FULL extent by a 0..1 value a field derives. */
export interface GaugeRule {
  gauge: string;
  rows?: string;
  /** `field:derivation` - a value the field's kind derives (`f7:share`, `f1:fraction`). */
  from: string;
  axis?: 'x' | 'y';
}

/** Write text a field derives into a layer the runtime owns. */
export interface WriteRule {
  write: string;
  rows?: string;
  /** `field:derivation` (`f7:label`, `f7:percent`, `f6:text`). */
  from: string;
}

export type PaintRule = LookRule | GaugeRule | WriteRule;

/** What KIND a field is, to the runtime - the thing that owns every comparison. `kind` names one
 *  of the runtime's field kinds; the other keys are that kind's parameters (`rows` for a row
 *  pick, `warnAt` for a clock, `fallback` for a status token). All strings, so the table stays
 *  plain JSON. */
export interface FieldKindSpec {
  kind: string;
  [param: string]: string | undefined;
}

export interface BehaviourData {
  version: 1;
  /** The recipe declaration that wrote this table, or "custom" once an editor has moved it
   *  past any recipe. The wizard reopens a binding from this; the runtime never reads it. */
  recipe: string;
  /** Every recipe compiled into this table when there is more than one - a full recipe beside
   *  any number of instanced switches and choices (`switch:Sponsor`). ADDITIVE OPTIONAL. */
  parts?: string[];
  /** The recipe's structural options as chosen (a checkbox each on the mapping step). */
  options?: Record<string, string | number | boolean>;
  /** Row sets: the row role -> its keys in row order (`answer: ["A","B","C"]`). */
  rows?: Record<string, string[]>;
  /** Field roles -> the `fN` they compiled to; a per-row role maps key -> `fN`. */
  fields?: Record<string, string | Record<string, string>>;
  /** `fN` -> what kind of field it is, where it is more than plain text. */
  kinds?: Record<string, FieldKindSpec>;
  paint: PaintRule[];
}

const DECL = 'var NOACG_BEHAVIOUR = ';

/** Locate the `var NOACG_BEHAVIOUR = {...};` literal in the JS: the index range of the object
 *  text (braces inclusive), or null. Brace matching respects JSON strings, exactly as
 *  animData.ts does for its own literal. */
export function locateBehaviourData(js: string): { start: number; end: number } | null {
  const at = js.indexOf(DECL);
  if (at === -1) return null;
  const start = js.indexOf('{', at + DECL.length);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < js.length; i++) {
    const c = js[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  return null;
}

/** The parse's verdict, for the validator: absent, readable, or present-but-wrong. */
export type BehaviourDataFault = 'absent' | 'ok' | 'unreadable' | 'off-shape' | 'unknown-version';

export function behaviourDataFault(js: string): BehaviourDataFault {
  const loc = locateBehaviourData(js);
  if (!loc) return 'absent';
  let raw: unknown;
  try {
    raw = JSON.parse(js.slice(loc.start, loc.end));
  } catch {
    return 'unreadable';
  }
  const version = (raw as { version?: unknown }).version;
  if (version !== BEHAVIOUR_VERSION) return 'unknown-version';
  return isBehaviourData(raw) ? 'ok' : 'off-shape';
}

/** Parse the table out of template.js, or null when absent, unreadable, off-shape or of a
 *  version this build does not speak. A normalizing parse: a future version-1 migration lands
 *  here, the same commit as the bump. */
export function parseBehaviourData(js: string): BehaviourData | null {
  const loc = locateBehaviourData(js);
  if (!loc) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(js.slice(loc.start, loc.end));
  } catch {
    return null;
  }
  return isBehaviourData(raw) ? raw : null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
const ROLE_RE = /^[a-z][a-z0-9.-]*$/;
/** A `field:fact` or `field:derivation` token. The head is a FIELD ROLE (`selectedAnswer`,
 *  `score` - resolved through `fields`, per row for a per-row role) or a bare `fN`. */
const TOKEN_RE = /^[A-Za-z][A-Za-z0-9.-]*:[a-z][a-z0-9-]*(?::[^:]*)?$/;
const STATE_RE = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;

function isCondition(v: unknown): v is BehaviourCondition {
  if (!isRecord(v)) return false;
  if (v.state !== undefined && !(isStringList(v.state) && v.state.every((s) => STATE_RE.test(s)))) return false;
  if (v.facts !== undefined && !(isStringList(v.facts) && v.facts.every((s) => TOKEN_RE.test(s)))) return false;
  return true;
}

function isRule(v: unknown): v is PaintRule {
  if (!isRecord(v)) return false;
  if (v.rows !== undefined && typeof v.rows !== 'string') return false;
  if (typeof v.look === 'string') {
    if (!ROLE_RE.test(v.look)) return false;
    if (v.when !== undefined && !isCondition(v.when)) return false;
    if (v.enter !== undefined && v.enter !== 'pop') return false;
    if (v.default !== undefined && typeof v.default !== 'string') return false;
    if (v.anchor !== undefined && typeof v.anchor !== 'string') return false;
    return true;
  }
  const target = typeof v.gauge === 'string' ? v.gauge : typeof v.write === 'string' ? v.write : null;
  if (target === null || !ROLE_RE.test(target)) return false;
  if (typeof v.from !== 'string' || !TOKEN_RE.test(v.from)) return false;
  if (v.axis !== undefined && v.axis !== 'x' && v.axis !== 'y') return false;
  return true;
}

/** The shape gate: strict about what it checks, silent about keys it does not know (additive
 *  optional fields are the doctrine). */
export function isBehaviourData(raw: unknown): raw is BehaviourData {
  if (!isRecord(raw)) return false;
  if (raw.version !== BEHAVIOUR_VERSION) return false;
  if (typeof raw.recipe !== 'string') return false;
  if (raw.options !== undefined && !isRecord(raw.options)) return false;
  if (raw.rows !== undefined) {
    if (!isRecord(raw.rows)) return false;
    for (const keys of Object.values(raw.rows)) if (!isStringList(keys)) return false;
  }
  if (raw.fields !== undefined) {
    if (!isRecord(raw.fields)) return false;
    for (const value of Object.values(raw.fields)) {
      if (typeof value === 'string') continue;
      if (!isRecord(value) || !Object.values(value).every((id) => typeof id === 'string')) return false;
    }
  }
  if (raw.kinds !== undefined) {
    if (!isRecord(raw.kinds)) return false;
    for (const spec of Object.values(raw.kinds)) {
      if (!isRecord(spec) || typeof spec.kind !== 'string') return false;
    }
  }
  if (!Array.isArray(raw.paint) || !raw.paint.every(isRule)) return false;
  return true;
}

/** The canonical text of the table: two-space JSON, keys in declaration order. Small enough
 *  that plain JSON is the readable form. */
export function serializeBehaviourData(data: BehaviourData): string {
  return JSON.stringify({ ...data, version: BEHAVIOUR_VERSION }, null, 2);
}

/** Every `group/state` a table's rules name - what the validator checks against the machine. */
export function behaviourStatesNamed(data: BehaviourData): string[] {
  const out = new Set<string>();
  for (const rule of data.paint) {
    if ('look' in rule) for (const s of rule.when?.state ?? []) out.add(s);
  }
  return [...out];
}

/** The `fN` ids a token head resolves to: the field map's entry for a role (every row's id for
 *  a per-row role), or the head itself when it is already an id. Empty = an unknown role. */
export function resolveTokenHead(data: BehaviourData, head: string): string[] {
  const mapped = data.fields?.[head];
  if (typeof mapped === 'string') return [mapped];
  if (mapped && typeof mapped === 'object') return Object.values(mapped);
  return /^f\d+$/.test(head) ? [head] : [];
}

/** Every field a table names - the `fN` ids in the field map and the kinds, and the heads of
 *  every token - for the validator: `ids` must all exist, `unresolved` heads name no field. */
export function behaviourFieldsNamed(data: BehaviourData): { ids: string[]; unresolved: string[] } {
  const ids = new Set<string>();
  const unresolved = new Set<string>();
  const fromToken = (token: string) => {
    const head = token.split(':')[0];
    const resolved = resolveTokenHead(data, head);
    if (resolved.length === 0) unresolved.add(head);
    for (const id of resolved) ids.add(id);
  };
  for (const rule of data.paint) {
    if ('look' in rule) for (const f of rule.when?.facts ?? []) fromToken(f);
    else fromToken(rule.from);
  }
  for (const value of Object.values(data.fields ?? {})) {
    if (typeof value === 'string') ids.add(value);
    else for (const id of Object.values(value)) ids.add(id);
  }
  for (const id of Object.keys(data.kinds ?? {})) ids.add(id);
  return { ids: [...ids], unresolved: [...unresolved] };
}
