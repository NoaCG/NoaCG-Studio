// TEMPLATE SEARCH — the Browse step's filter + query engine
// (docs/TEMPLATE_TAXONOMY_PROPOSAL.md §13-14). Client-side over the derived metadata:
// strict facets AND together, choices within a facet OR, programme format RANKS rather
// than filters ("Best for X" / "Also works"), and free text matches a field-weighted
// index with phrase-first alias expansion.

import type { StyleTag } from '../model/fonts';
import type { TemplateVariant } from '../model/wizard';
import {
  ALIASES,
  CAPABILITIES,
  CATEGORY_GROUP_OF,
  FAMILIES,
  FORMATS,
  graphicCategoryById,
  normalizeSearchText,
  SEMANTIC_LABELS,
  STRUCTURE_LABELS,
  type AliasTargets,
  type CapabilityId,
  type CategoryGroupId,
  type GraphicCategoryId,
  type MotionIntensity,
  type OccasionId,
  type PlacementId,
  type ProgrammeFamilyId,
  type ProgrammeFormatId,
  type StructureId,
} from '../model/taxonomy';
import { allTemplateMeta, type TemplateMeta } from './templateMeta';

// ── Filters ─────────────────────────────────────────────────────────────────

export type FieldBucket = '1' | '2' | '3' | '4-5' | '6+' | 'repeating';

export interface BrowseFilters {
  query: string;
  /** Ranking facet — never hides (proposal §13.1). */
  family: ProgrammeFamilyId | null;
  format: ProgrammeFormatId | null;
  /** Strict facets. `group` is the lead dropdown's shelf (model/taxonomy.ts
   *  CATEGORY_GROUPS); `category` narrows further to one member category via the group's
   *  refinement chips. A set category always implies its group's result or narrower, so the
   *  two compose without ordering rules. */
  group: CategoryGroupId | null;
  category: GraphicCategoryId | null;
  fieldBucket: FieldBucket | null;
  style: StyleTag | null;
  structures: StructureId[];
  capabilities: CapabilityId[];
  placement: PlacementId | null;
  intensity: MotionIntensity | null;
}

export const NO_BROWSE_FILTERS: BrowseFilters = {
  query: '',
  family: null,
  format: null,
  group: null,
  category: null,
  fieldBucket: null,
  style: null,
  structures: [],
  capabilities: [],
  placement: null,
  intensity: null,
};

const BUCKET_RANGES: Record<Exclude<FieldBucket, 'repeating'>, [number, number]> = {
  '1': [1, 1],
  '2': [2, 2],
  '3': [3, 3],
  '4-5': [4, 5],
  '6+': [6, Infinity],
};

/** Bucket matching is RANGE INTERSECTION over the reachable visible-field range — one
 *  template can sit under several buckets by design (proposal §6.1). */
function bucketMatches(bucket: FieldBucket, meta: TemplateMeta): boolean {
  if (bucket === 'repeating') return meta.fieldCounts.repeating > 0;
  const [lo, hi] = BUCKET_RANGES[bucket];
  const [min, max] = meta.fieldCounts.visibleRange;
  return min <= hi && max >= lo;
}

function passesStrictFilters(meta: TemplateMeta, f: BrowseFilters): boolean {
  if (f.group && CATEGORY_GROUP_OF[meta.category] !== f.group) return false;
  if (f.category && meta.category !== f.category) return false;
  if (f.fieldBucket && !bucketMatches(f.fieldBucket, meta)) return false;
  if (f.style && meta.styleFamily !== f.style) return false;
  if (f.structures.length && !f.structures.some((s) => meta.structures.includes(s))) return false;
  if (f.capabilities.length && !f.capabilities.every((c) => meta.capabilities.includes(c))) return false;
  if (f.placement && !meta.placements.includes(f.placement)) return false;
  if (f.intensity && meta.motion.intensity !== f.intensity) return false;
  return true;
}

// ── The text index (proposal §14.1) ─────────────────────────────────────────

interface IndexedField {
  text: string;
  weight: number;
}

/** The alias table folds its KEYS with the same function (model/taxonomy.ts), which is what
 *  lets a locale table be written in the spelling people type. */
const normalize = normalizeSearchText;

/** Trivial plural fold: 'tickers' matches 'ticker'. */
function fold(token: string): string {
  return token.replace(/(?:es|s)$/, '');
}

// ── Forgiving matching (owner walk 2026-08-28) ──────────────────────────────
//
// "We're used to how good Google is… This search is very strict and you have to search with
// the exact right words." Two loosenings, both for a PERSON's query only — `briefTerm` keeps
// the exact AND, because retrieval weights each term by its idf and a loosened term reorders
// shortlists (see BrowseContext.briefTerm):
//   - a TYPO: a token of 5+ letters matches a word one edit away (insert, delete, substitute,
//     adjacent swap) at half the field's weight;
//   - a PARTIAL WORD: a token of 5+ letters matches anywhere inside a word ("board" reaches
//     "scoreboards"), also at half weight.
// Half weight is what keeps a loosened match from outranking an exact one, and membership is
// still token-AND, so a bent token has to land on the same design as every other token.
//
// FORGIVENESS IS A FALLBACK, NEVER AN EXPANSION: a token the catalog reaches EXACTLY keeps the
// exact contract, so every query that already answered goes on answering byte-identically —
// the loosening only rescues tokens that reached nothing. Without that rule, "stinger" (one
// edit from "singer") would quietly grow every result it already had right.

const FUZZY_MIN = 5;

/** Damerau-Levenshtein distance ≤ 1, without building the matrix. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i += 1;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // one substitution
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // swap
  }
  const [shorter, longer] = la < lb ? [a, b] : [b, a];
  return shorter.slice(i) === longer.slice(i + 1); // one insertion / deletion
}

/** 1 = exact (word-start prefix or plural fold), 0.5 = forgiving (typo or mid-word),
 *  0 = no match. The one matcher `textScore` and `tokenReaches` both ask, so the reachability
 *  filter and the scorer can never disagree about what a token can touch. */
function wordMatch(folded: string, word: string, forgiving: boolean): number {
  if (word.startsWith(folded) || fold(word) === folded) return 1;
  if (!forgiving || folded.length < FUZZY_MIN) return 0;
  if (word.includes(folded)) return 0.5;
  if (withinOneEdit(folded, word) || withinOneEdit(folded, fold(word))) return 0.5;
  return 0;
}

const indexCache = new Map<string, IndexedField[]>();

function indexFor(meta: TemplateMeta): IndexedField[] {
  const cached = indexCache.get(meta.id);
  if (cached) return cached;
  const category = graphicCategoryById(meta.category);
  const formatNames = FORMATS.filter((f) => meta.programmeFormats.includes(f.id)).map((f) => f.name);
  const familyNames = FAMILIES.filter((f) => meta.programmeFamilies.includes(f.id)).map((f) => f.name);
  const fields: IndexedField[] = [
    { text: normalize(meta.name), weight: 10 },
    // The design's CODE — "sb08", "cr01" — the id every AGENTS.md, doc and teacher's slide
    // calls a design by. The owner typed one on the 2026-08-28 walk and got nothing; it is
    // worth the name's own weight because it IS a name, just the internal one.
    { text: normalize(meta.id), weight: 10 },
    { text: normalize(`${category.name} ${meta.subtype ?? ''}`), weight: 8 },
    { text: normalize(meta.fieldSemantics.map((s) => SEMANTIC_LABELS[s]).join(' ')), weight: 6 },
    { text: normalize(meta.fieldSchema.map((f) => f.title).join(' ')), weight: 6 },
    { text: normalize(meta.capabilities.map((c) => CAPABILITIES.find((k) => k.id === c)?.name ?? '').join(' ')), weight: 5 },
    { text: normalize([...formatNames, ...familyNames].join(' ')), weight: 4 },
    { text: normalize(meta.structures.map((s) => STRUCTURE_LABELS[s]).join(' ')), weight: 4 },
    { text: normalize(meta.description), weight: 2 },
  ];
  indexCache.set(meta.id, fields);
  return fields;
}

/**
 * EVERY WORD THE CATALOG CAN BE MATCHED ON, folded once.
 *
 * It exists to answer one question: can this token reach ANY design at all? `textScore` is
 * token-AND, so a single word nothing in the catalog carries takes the whole query to zero —
 * "big title" returned NOTHING while "title" returned 71, because "big" is an adjective no
 * design, category, field title or description happens to use. That is the harshest failure a
 * search can have: the reader typed two words, one of them was right, and the step answered
 * with an empty grid.
 *
 * So a token that reaches nothing is DROPPED rather than allowed to zero the result, and the
 * step says which words it ignored. The AND stays exact over the words that do mean something,
 * a query made only of unreachable words still honestly returns nothing, and the ranking is
 * untouched — a dropped token contributed no score in the first place.
 */
let vocabulary: Set<string> | null = null;

function catalogVocabulary(): Set<string> {
  if (vocabulary) return vocabulary;
  const words = new Set<string>();
  for (const { meta } of allTemplateMeta()) {
    for (const field of indexFor(meta)) {
      for (const word of field.text.split(/\s+/)) {
        if (word) words.add(word);
      }
    }
  }
  vocabulary = words;
  return words;
}

/** The same reachability test `textScore` applies per design, asked once against the whole
 *  catalog — through the one `wordMatch`, at the same strictness. */
function tokenReaches(token: string, forgiving: boolean): boolean {
  const folded = fold(token);
  for (const word of catalogVocabulary()) {
    if (wordMatch(folded, word, forgiving) > 0) return true;
  }
  return false;
}

// ── Alias expansion (phrase-first, proposal §14.2) ──────────────────────────

interface ParsedQuery {
  tokens: string[];
  boostCategories: Set<GraphicCategoryId>;
  boostSubtypes: Set<string>;
  boostOccasions: Set<OccasionId>;
  boostStructures: Set<StructureId>;
  boostFormats: Set<ProgrammeFormatId>;
  boostFamilies: Set<ProgrammeFamilyId>;
  boostStyles: Set<StyleTag>;
  /**
   * The alias phrases this query matched, kept because expansion CONSUMES them.
   *
   * An alias is stripped out of the token text so it cannot also be matched as a word, which is
   * right for "breaking news" (a genre, not a design) and wrong for "intermission" — a word that
   * is both an alias for the whole holding category AND the name of one design in it. With the
   * token gone, `textScore` returns 0 for everybody, so the design literally CALLED Intermission
   * scored exactly what its twenty siblings scored and sorted purely by catalog order: 13th, off
   * the first page, unreachable by typing its own name. `namedAliasScore` below is the answer.
   */
  aliasPhrases: string[];
  /**
   * The words an occasion phrase SPENT WITHOUT CONSUMING — the other half of the non-consuming
   * rule in `parseQuery`.
   *
   * A word left in the query still faces the unreachable-token drop, and "goodbye" reaches no
   * design's name, category or description: it is a purpose word and nothing else. So the drop
   * removed it and the step announced "we ignored: goodbye" over a full page of sign-off cards
   * that word had just produced. Reporting a word as ignored when it decided the whole answer is
   * worse than the empty grid the drop exists to prevent — one is an honest failure, the other
   * tells the reader their question was thrown away when it was not.
   */
  spentWords: Set<string>;
}

/** Is this alias entry ONE an occasion minted, and nothing else? Those are the non-consuming
 *  keys (see the loop below); an entry that also carries a category, subtype or format meant
 *  something before facet I existed and keeps its old behaviour. */
function occasionOnly(targets: AliasTargets): boolean {
  return Boolean(targets.occasions?.length) && Object.values(targets).filter(Boolean).length === 1;
}

function parseQuery(raw: string, forgiving: boolean): ParsedQuery {
  let text = ` ${normalize(raw)} `;
  const parsed: ParsedQuery = {
    tokens: [],
    boostCategories: new Set(),
    boostSubtypes: new Set(),
    boostOccasions: new Set(),
    boostStructures: new Set(),
    boostFormats: new Set(),
    boostFamilies: new Set(),
    boostStyles: new Set(),
    aliasPhrases: [],
    spentWords: new Set(),
  };
  const addTargets = (t: AliasTargets) => {
    t.categories?.forEach((c) => parsed.boostCategories.add(c));
    t.subtypes?.forEach((s) => parsed.boostSubtypes.add(s));
    t.occasions?.forEach((o) => parsed.boostOccasions.add(o));
    t.structures?.forEach((s) => parsed.boostStructures.add(s));
    t.formats?.forEach((f) => parsed.boostFormats.add(f));
    t.families?.forEach((f) => parsed.boostFamilies.add(f));
    t.styles?.forEach((s) => parsed.boostStyles.add(s));
  };
  // Longest aliases first so "breaking news" wins over "breaking".
  const aliasKeys = Object.keys(ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of aliasKeys) {
    const needle = ` ${alias} `;
    if (!text.includes(needle)) continue;
    addTargets(ALIASES[alias]);
    // AN OCCASION PHRASE ADDS A PURPOSE; IT NEVER DELETES A WORD.
    //
    // Expansion normally CONSUMES its phrase, which is right for "breaking news" (a genre, not a
    // design) and catastrophic for a purpose word that is also an ordinary English word the
    // catalog uses — the hazard model/taxonomy.ts states outright, and the reason bare "logo",
    // "text" and "super" are deliberately not keys. Facet I mints a key for every phrase a person
    // might type at a moment, so it walked straight into it: measured 2026-09-06, "halftime" lost
    // ig20 (the half-time notes board, the ONLY design that answers the word) and "standby" lost
    // the four live bugs, because the token was eaten before `textScore` ever saw it. Neither can
    // be rescued downstream — `browseTemplates` drops a design scoring zero on both halves before
    // `namedAliasScore` is reached.
    //
    // So a key that exists ONLY because an occasion declared it leaves the text alone: the moment
    // is boosted AND the word still matches whatever carries it. A key that already meant
    // something before facet I ("intermission", the holding category) keeps consuming exactly as
    // it did, so no query that worked yesterday answers differently today.
    if (occasionOnly(ALIASES[alias])) {
      for (const word of alias.split(/\s+/)) parsed.spentWords.add(word);
      continue;
    }
    text = text.replace(needle, ' ');
    parsed.aliasPhrases.push(alias);
  }
  let tokens = text.split(/\s+/).filter(Boolean);
  // A TYPO IN AN ALIAS lands too — the Nordic vocabulary lives only in the alias table, so a
  // one-edit miss on "namnskylt" had nothing else to fall back on. Guard: a token the catalog
  // knows EXACTLY is never bent into a nearby alias — "title" must not become Swedish "titel",
  // and "pause" (a real capability word) must not become Swedish "paus", the break screen.
  if (forgiving) {
    tokens = tokens.filter((token) => {
      if (token.length < FUZZY_MIN || tokenReaches(token, false)) return true;
      const near = aliasKeys.find((k) => !k.includes(' ') && withinOneEdit(token, k));
      if (!near) return true;
      addTargets(ALIASES[near]);
      // The same rule as the phrase loop above, and it bites here too: a one-word occasion key
      // matches ITSELF at distance zero, so this branch would swallow the very token it came
      // from. That is how "halftime" still lost ig20 after the phrase loop was fixed — the word
      // reaches no design EXACTLY, which is exactly when a forgiving mid-word match is the only
      // thing that can find it, and the token has to survive to get one.
      if (occasionOnly(ALIASES[near])) {
        parsed.spentWords.add(token);
        return true;
      }
      parsed.aliasPhrases.push(near);
      return false;
    });
  }
  parsed.tokens = tokens;
  return parsed;
}

/**
 * A design NAMED after an alias the query spent — worth the name field's own weight, because
 * that is exactly what the match is and what `textScore` would have paid had the alias not
 * eaten the word first.
 *
 * It fires only when an alias actually consumed a phrase, so an ordinary query is untouched:
 * "Short Break" still scores its name through `textScore` once and only once. When one does
 * fire, the design called by that name clears its category siblings by a full field weight
 * rather than by a catalog-order thousandth, which is the difference between reachable and not.
 */
function namedAliasScore(meta: TemplateMeta, q: ParsedQuery): number {
  if (!q.aliasPhrases.length) return 0;
  const name = ` ${normalize(meta.name)} `;
  return q.aliasPhrases.some((alias) => name.includes(` ${alias} `)) ? 10 : 0;
}

/** One query token, with the strictness it earned: forgiving only when the catalog cannot
 *  reach it exactly (the fallback rule above). Computed ONCE per query in `browseTemplates`,
 *  because deciding it needs a whole-vocabulary scan that must not run per design. */
interface PlannedToken {
  token: string;
  forgiving: boolean;
}

/** Token-AND text score: every remaining token must match some indexed field (through
 *  `wordMatch` — exact at full field weight, forgiving at half); the score sums the best
 *  weighted match per token. 0 = no match. */
function textScore(meta: TemplateMeta, plan: PlannedToken[]): number {
  if (!plan.length) return 0;
  const fields = indexFor(meta);
  let score = 0;
  for (const { token, forgiving } of plan) {
    const folded = fold(token);
    let best = 0;
    for (const field of fields) {
      for (const word of field.text.split(/\s+/)) {
        const quality = wordMatch(folded, word, forgiving);
        if (quality > 0) best = Math.max(best, field.weight * quality);
      }
    }
    if (!best) return 0;
    score += best;
  }
  return score;
}

function aliasScore(meta: TemplateMeta, q: ParsedQuery): number {
  let score = 0;
  if (q.boostCategories.has(meta.category)) score += 40;
  // THE MOMENT OUTRANKS THE FORM (facet I — model/taxonomy.ts OCCASIONS).
  //
  // Measured before this existed: "be right back" is an alias for the holding CATEGORY, so it
  // returned all 21 holding screens at an identical 40 and the BRB card the reader asked for
  // ("Short Break") came 11th, under five front doors and a service hold. An alias can only ever
  // point at a facet, and until now no facet said what a design was FOR — which is the owner's
  // complaint on the 2026-08-28 walk, in a second dress.
  //
  // 35 is chosen against the two scores it has to sit between: a design carrying the moment
  // clears one that merely shares the category (40 + 35 against 40) by more than any tiebreak,
  // while a word that names a moment and nothing else still cannot outrank a design's own NAME
  // plus its category. It sits above the subtype's 25 deliberately: a subtype is one form's
  // internal filing, and the moment is the thing the reader actually asked about.
  if (meta.occasions.some((o) => q.boostOccasions.has(o))) score += 35;
  // A precise word ranks its SUBTYPE above the rest of the boosted category.
  if (meta.subtype && q.boostSubtypes.has(meta.subtype)) score += 25;
  if (meta.structures.some((s) => q.boostStructures.has(s))) score += 20;
  if (meta.programmeFormats.some((f) => q.boostFormats.has(f))) score += 15;
  if (meta.programmeFamilies.some((f) => q.boostFamilies.has(f))) score += 10;
  if (q.boostStyles.has(meta.styleFamily)) score += 10;
  return score;
}

// ── Programme ranking (proposal §13) ────────────────────────────────────────

/** 'all'-relevance categories match every format but rank below genuine pack-derived
 *  matches (proposal §3). */
function formatBoost(meta: TemplateMeta, f: BrowseFilters): { boost: number; bestFor: boolean } {
  const universal = graphicCategoryById(meta.category).relevance === 'all';
  if (f.format) {
    if (!meta.programmeFormats.includes(f.format)) return { boost: 0, bestFor: false };
    return { boost: universal ? 60 : 100, bestFor: true };
  }
  if (f.family) {
    if (!meta.programmeFamilies.includes(f.family)) return { boost: 0, bestFor: false };
    return { boost: universal ? 30 : 50, bestFor: true };
  }
  return { boost: 0, bestFor: false };
}

// ── The engine ──────────────────────────────────────────────────────────────

export interface BrowseResult {
  variant: TemplateVariant;
  meta: TemplateMeta;
  score: number;
  /** True when the selected format/family genuinely matches — the "Best for" section. */
  bestFor: boolean;
}

export interface BrowseOutcome {
  best: BrowseResult[];
  also: BrowseResult[];
  total: number;
  /** Words in the query that reach NO design in the catalog and were left out of the match
   *  (see catalogVocabulary above). The step says them back, because a result the reader did not
   *  fully ask for has to admit which part of the question it dropped. */
  ignored: string[];
}

/** Ambient context that RANKS but is never a filter — the user did not choose it, so it
 *  earns no chip and clearing the filters does not clear it. */
export interface BrowseContext {
  /** The saved project brand's style family, when "Use current project's colors & typeface"
   *  is on: the package's siblings lead (proposal §13.3). A small boost, deliberately
   *  weaker than a programme match — it must never outrank what the user asked for. */
  brandFamily?: StyleTag | null;
  /** Variant ids this visitor may not see — a design an admin marked beta, internal or
   *  hidden and this visitor is not entitled to (docs/ADMIN.md §7, resolved server-side by
   *  GET /api/me/entitlement). They are REMOVED before scoring, never greyed: a card the
   *  visitor cannot use is noise, and an empty-state count that includes it would lie.
   *  Empty offline and whenever the lookup fails, so the free catalog stays whole. */
  hiddenIds?: readonly string[];
  /**
   * This query is ONE TERM OF A BRIEF, not a person's search — the AI shortlist asking "which
   * designs does this word reach" (ai/retrieval.ts), one term at a time.
   *
   * It turns off `namedAliasScore` AND the unreachable-token drop, and nothing else. Both
   * exist for a RANKED LIST a person reads, and retrieval shows no list and no first page.
   *
   * The drop is the more dangerous of the two here. Retrieval weights each term by its idf
   * (`log(pool / hits)`) and compares the products against a relative cut, so a term matching
   * NOTHING is free - it contributes no score to anybody. Drop its unreachable word and the
   * same term matches a great many designs at a low idf, spraying a small score across the
   * pool and reordering the shortlist: a two-word term stops meaning "no design carries this"
   * and starts meaning "every design carrying the half of it that exists".
   *
   * This is a guard, not a repair - measured 2026-08-28 with
   * `scripts/spike-brief-terms.mjs`, every term the worship brief in `e2e/adapt-first.spec.ts`
   * produces is a SINGLE token, and a lone unreachable token scores zero either way, so no
   * shortlist in the suite moves today. It is declared because the terms come from a model's
   * intent and a person's brief, so the day one of them is two words with one meaningless
   * half is not a day anybody will be watching this file.
   *
   * Declared on the unusual caller rather than the ordinary one, so browse surfaces get both
   * behaviours by default and the one consumer with a different question opts out explicitly.
   *
   * On `namedAliasScore`: that bonus exists so a person typing a
   * design's own name sees it first, which is a RANKED-LIST concern: retrieval shows no list
   * and no first page. It multiplies each score by the term's idf and compares the products
   * against a relative relevance cut, so an absolute bonus on one design does not merely
   * reorder - it raises the bar every other design is measured against, and a design that
   * cleared the cut stops clearing it. Measured: it dropped a worship brief from two designs
   * above the cut to one, and `e2e/ai-retrieval.spec.ts` is the gate that said so.
   *
   */
  briefTerm?: boolean;
}

const BRAND_BOOST = 8;

export function browseTemplates(filters: BrowseFilters, context: BrowseContext = {}): BrowseOutcome {
  // A person's search is FORGIVING (typos, partial words, near-miss aliases); a brief term
  // keeps the exact strict match throughout (see BrowseContext.briefTerm).
  const forgiving = !context.briefTerm;
  const q = parseQuery(filters.query, forgiving);
  const hasQuery = filters.query.trim().length > 0;
  // A token nothing in the catalog carries would take the whole AND to zero, so it is set aside
  // rather than allowed to answer an almost-right question with an empty grid — for a PERSON's
  // search. A brief term keeps the exact AND, because a term that matches nothing is what makes
  // its idf meaningful (see BrowseContext.briefTerm).
  const tokens = context.briefTerm ? q.tokens : q.tokens.filter((t) => tokenReaches(t, true));
  // A word the index cannot reach but an OCCASION spent is not ignored — it is the word that
  // answered (see ParsedQuery.spentWords). It contributes no text score either way; what this
  // decides is only whether the step tells the reader it threw their word away.
  const ignored = q.tokens.filter((t) => !tokens.includes(t) && !q.spentWords.has(t));
  // The fallback rule: a token the catalog reaches exactly keeps the exact contract; only a
  // token that reached nothing is matched forgivingly. Decided here, once per query.
  const plan: PlannedToken[] = tokens.map((t) => ({
    token: t,
    forgiving: forgiving && !tokenReaches(t, false),
  }));
  const results: BrowseResult[] = [];

  const hidden = context.hiddenIds?.length ? new Set(context.hiddenIds) : null;

  allTemplateMeta().forEach(({ variant, meta }, catalogIndex) => {
    if (hidden?.has(variant.id)) return;
    if (!passesStrictFilters(meta, filters)) return;

    let score = 0;
    if (hasQuery) {
      const text = textScore(meta, plan);
      const alias = aliasScore(meta, q);
      // A query must land somewhere — tokens in the index, or an alias hit.
      if (text === 0 && alias === 0) return;
      score += text + alias + (context.briefTerm ? 0 : namedAliasScore(meta, q));
    }
    const { boost, bestFor } = formatBoost(meta, filters);
    score += boost;
    if (context.brandFamily && meta.styleFamily === context.brandFamily) score += BRAND_BOOST;
    // Stable catalog-order tiebreak (proposal §13.3): earlier = marginally higher.
    score += (1000 - catalogIndex) / 100000;
    results.push({ variant, meta, score, bestFor });
  });

  results.sort((a, b) => b.score - a.score);
  const ranking = filters.format !== null || filters.family !== null;
  const ordered = hasQuery || ranking ? results : spreadFirstPage(results);
  return {
    best: ranking ? results.filter((r) => r.bestFor) : ordered,
    also: ranking ? results.filter((r) => !r.bestFor) : [],
    total: results.length,
    ignored,
  };
}

/**
 * The Browse step's page size. Duplicated from the component on purpose: this module has to know
 * how many cards the fold holds to make that many of them different, and a wrong number here
 * spreads the wrong slice rather than breaking anything.
 */
const FIRST_PAGE = 12;

/**
 * MAKE THE FIRST PAGE LOOK LIKE THE CATEGORY, not like its first twelve entries.
 *
 * Browse renders a PAGE of twelve, so for most people the first twelve ARE the category. With no
 * query and no ranking facet the only tiebreak is catalog position, so the fold showed whatever
 * happened to be written first - and designs get written in batches, which means the fold showed
 * one batch. Measured 2026-08-21 on the lower thirds: the first twelve were 10 dark and 10 orange
 * out of a shelf carrying nine accent hues, 31 designs with no coloured accent and 7 light
 * backdrops. The owner read that page and said the graphics "all look the same". They do; the
 * category does not.
 *
 * THE AXES ARE THE ONES THAT VERIFIED. `scripts/card-look-sweep.mjs` measures what an eye reads
 * off a rendered card - backdrop, accent hue, footprint - and `spike-declared-vs-measured.mjs`
 * checked those against what a design DECLARES, because ordering cannot afford a render. The
 * palette's accent hue predicted the measured hue 72/72. The palette's panel predicted the
 * measured backdrop only 60/80, so backdrop is deliberately NOT used here: a 75% signal would be
 * guessing at the one job this function has. Style family stands in for panel treatment, which
 * is the axis it genuinely explains (docs/CATALOG_VARIETY.md §1.2).
 *
 * Greedy, and score still decides everything else: walk the page, and for each slot take the
 * highest-scoring design whose (hue, family) pair is least represented so far. Everything past
 * the fold keeps its score order untouched, so this changes what is SEEN FIRST and never what is
 * ranked highest. There is deliberately no house design pinned to slot one - owner, 2026-08-21:
 * "no one wants to use a design that other people also use."
 */
function spreadFirstPage(results: BrowseResult[]): BrowseResult[] {
  if (results.length <= 2) return results;
  const hueOf = (r: BrowseResult) => accentHueBucket(r.variant.defaultPalette?.accent);
  const famOf = (r: BrowseResult) => r.variant.styleTag ?? '';
  const hueSeen = new Map<string, number>();
  const famSeen = new Map<string, number>();
  const pool = [...results];
  const page: BrowseResult[] = [];
  while (page.length < Math.min(FIRST_PAGE, results.length) && pool.length > 0) {
    let pick = 0;
    let best: [number, number] = [Infinity, Infinity];
    for (let i = 0; i < pool.length; i += 1) {
      // HUE FIRST, family only to break a tie within it. Weighing the two equally made a
      // COMPOUND key, and `none` is a hue bucket like any other - so a colourless design in each
      // family read as four different pairs and no-accent took 7 of the 12 slots against a 30%
      // share of the shelf. Lexicographic is what "spread the colour, then the treatment" means.
      const rank: [number, number] = [hueSeen.get(hueOf(pool[i])) ?? 0, famSeen.get(famOf(pool[i])) ?? 0];
      // `<` not `<=` throughout: the pool is already in score order, so the first index reaching
      // a rank is the best-scoring design holding it.
      if (rank[0] < best[0] || (rank[0] === best[0] && rank[1] < best[1])) {
        best = rank;
        pick = i;
        if (rank[0] === 0 && rank[1] === 0) break; // nothing can beat an unseen hue AND family
      }
    }
    const [chosen] = pool.splice(pick, 1);
    hueSeen.set(hueOf(chosen), (hueSeen.get(hueOf(chosen)) ?? 0) + 1);
    famSeen.set(famOf(chosen), (famSeen.get(famOf(chosen)) ?? 0) + 1);
    page.push(chosen);
  }
  return [...page, ...pool];
}

/** Twelve 30-degree buckets, or `none` for a neutral accent - the same buckets the card-look
 *  sweep reports in, so a claim made from one can be checked against the other. */
export function accentHueBucket(hex: string | undefined): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!match) return 'none';
  const n = parseInt(match[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // A grey or near-grey accent has no hue to bucket, and calling it "red" would make two
  // colourless designs look like a deliberate pair.
  if (max === min || (max - min) / max < 0.15) return 'none';
  let h;
  if (max === r) h = ((g - b) / (max - min) + 6) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  return String(Math.floor((h * 60) / 30) % 12);
}

/** The chip whose removal restores the largest result count — the zero-result escape
 *  hatch (proposal §13.2). Returns null when no single strict filter is set. */
export function mostRestrictiveFilter(filters: BrowseFilters): keyof BrowseFilters | null {
  const strictKeys: (keyof BrowseFilters)[] = [
    'group', 'category', 'fieldBucket', 'style', 'structures', 'capabilities', 'placement', 'intensity',
  ];
  let bestKey: keyof BrowseFilters | null = null;
  let bestCount = -1;
  for (const key of strictKeys) {
    const value = filters[key];
    const isSet = Array.isArray(value) ? value.length > 0 : value !== null;
    if (!isSet) continue;
    const without = { ...filters, [key]: Array.isArray(value) ? [] : null } as BrowseFilters;
    const count = browseTemplates(without).total;
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }
  return bestKey;
}

/** Facet values worth rendering as chips: only those with catalog mass (proposal §12.1),
 *  same rule as category tiles. */
export function offeredIntensities(): MotionIntensity[] {
  const seen = new Set<MotionIntensity>();
  for (const { meta } of allTemplateMeta()) seen.add(meta.motion.intensity);
  return (['none', 'subtle', 'medium', 'strong'] as MotionIntensity[]).filter((i) => seen.has(i));
}

export function offeredStructures(): StructureId[] {
  const seen = new Set<StructureId>();
  for (const { meta } of allTemplateMeta()) meta.structures.forEach((s) => seen.add(s));
  return (Object.keys(STRUCTURE_LABELS) as StructureId[]).filter((s) => seen.has(s));
}

export function offeredCapabilityFilters(): CapabilityId[] {
  const present = new Set<CapabilityId>();
  for (const { meta } of allTemplateMeta()) meta.capabilities.forEach((c) => present.add(c));
  return CAPABILITIES.filter((c) => c.filter && present.has(c.id)).map((c) => c.id);
}

/** Categories present in the catalog — used by GRAPHIC_CATEGORIES-driven UI to hide
 *  taxonomy-ahead-of-catalog tiles. Re-exported convenience over templateMeta. */
export function categoriesWithContent(): Set<GraphicCategoryId> {
  const seen = new Set<GraphicCategoryId>();
  for (const { meta } of allTemplateMeta()) seen.add(meta.category);
  return seen;
}
