// EXEMPLAR MEASUREMENTS - what the shipped catalog ACTUALLY SET, per kind of graphic
// (docs/PRO_HARNESS_PLAN.md §3.4). The third kind of number the harness hands a model, and it is
// a different KIND of fact from the other two:
//
//   src/model/designRules.ts  the legibility FLOORS - measured on a screen, ratified, binding.
//   knowledge.ts              the taste RANGES of docs/DESIGN_LANGUAGE.md - ratified, advisory.
//   this module               the CORPUS - what 504 shipped designs typed into their own CSS.
//
// A range says "a name sits around 44-92px". This says "across the 26 shipped scoreboards the
// score figure ranges 20-80px and the middle one is 43.5px, from 26 declarations". The second is
// an observation with an n on it, and the card says so in its own first line, because a
// measurement read as a rule is a fifth copy of the taste numbers and the harness's whole
// knowledge split (`knowledge.ts` header, one module zero drift) exists to prevent that.
//
// WHY IT EXISTS. The taste ranges were ratified on LOWER THIRDS. A cheap model designing a
// scoreboard reads them and has nothing that says what a score figure is, next to a team name,
// on a strip that already works. The shipped scoreboards' numbers are that, and they cost the
// prompt about 270 tokens - measured over the nineteen cards, not estimated.
//
// WHAT IS WITHHELD, AND WHY. Never a design's code, never a selector, never a design's id or
// name. A model handed one design's stylesheet copies its composition - the anti-anchoring rule
// this directory has held since the knowledge cards were written (`src/ai/AGENTS.md`) - and a
// named design reads as a thing to reproduce. Numbers and the role word the part plays carry
// the information without carrying the picture, which is the whole trade.
//
// WHERE THE NUMBERS COME FROM. Statically, from the designs' own source CSS - no browser, no
// render. `variant.create()` needs a real DOM (`scripts/catalog-emit.mjs` measured every one of
// the 504 designs failing in bare Node on `DOMParser`), and a rendered measurement would price
// a Chromium round into a derivation whose answer does not change: a design's authored
// `font-size: calc(44px * var(--scale))` IS the number it ships, before any scale, at the 1080p
// reference every catalog design is written against. The reduction below is that text, parsed.
// `scripts/pro-harness-exemplars.test.mjs` re-derives the whole table from the real catalog on
// every build and fails when it drifts, so the constant here is never hand-maintained.
//
// Pure module: numbers and strings. It imports nothing - in particular not the catalog or the
// registry, which stay `typeSemantics.ts`'s alone (this directory's AGENTS.md).

/** A measured spread. `median` is the middle of the samples, not their mean, so one outlier
 *  cannot move it (an even count averages the two middles - see `spread`). */
export interface Spread {
  /** How many declarations the spread was measured from. */
  n: number;
  min: number;
  median: number;
  max: number;
}

/** Type sizes grouped by the ROLE WORD the design gave the part (score, name, kicker, clock). */
export interface RoleSizes {
  role: string;
  sizes: Spread;
}

/** One kind of graphic's measured corpus. Keyed by the wizard category, which is the coarse
 *  grouping a brief actually names ("a scoreboard", "a lower third"); `typeIds` is how a request
 *  that resolved to a finer graphic type finds its way here. */
export interface ExemplarCorpus {
  /** The wizard category id - `lower-third`, `scoreboard`, `corner-bug`. */
  category: string;
  /** Every graphic type whose designs sit in this category. */
  typeIds: readonly string[];
  /** Shipped designs in the category. */
  designs: number;
  /** Source files the numbers were parsed from. */
  files: number;
  typeSizes: readonly RoleSizes[];
  /** Panel padding, in the two axes CSS shorthand orders them. */
  paddingBlock: Spread | null;
  paddingInline: Spread | null;
  gap: Spread | null;
  radius: Spread | null;
  /** letter-spacing, in em - the only instrument here whose unit is not px. */
  tracking: Spread | null;
  lineHeight: Spread | null;
}

/** A role word needs this many samples before the card shows it: two designs agreeing is a
 *  coincidence, and one design's number is the anchoring this module refuses to hand over. */
export const MIN_ROLE_SAMPLES = 3;

/** How many role words a card shows. The tail is a long list of one-off parts; the head is the
 *  three or four the graphic is actually made of. */
export const MAX_ROLES = 8;

/** A radius written as a pill. Designs say `999px`; the card says so in words instead. */
export const PILL_RADIUS = 999;

// ── The derivation ──────────────────────────────────────────────────────────────────────────
// Exported because the test re-runs it over the real catalog and compares the result to
// `EXEMPLAR_CORPORA` below. One implementation, so a pin that passes means the constant IS the
// corpus rather than a snapshot of what it once was.

/** Every instrument this module reads out of one stylesheet, ungrouped. */
export interface CssMeasurement {
  fontByRole: Record<string, number[]>;
  paddingBlock: number[];
  paddingInline: number[];
  gap: number[];
  radius: number[];
  tracking: number[];
  lineHeight: number[];
}

/** The ungrouped sample lists, named once. `emptyMeasurement` and `mergeMeasurements` both walk
 *  this, so a new instrument cannot be created in one and forgotten in the other. */
const SAMPLE_KEYS = ['paddingBlock', 'paddingInline', 'gap', 'radius', 'tracking', 'lineHeight'] as const;

export function emptyMeasurement(): CssMeasurement {
  const out = { fontByRole: {} } as CssMeasurement;
  for (const key of SAMPLE_KEYS) out[key] = [];
  return out;
}

/**
 * The px number a catalog declaration carries. Every design writes its sizes at the 1080p
 * reference and multiplies by the runtime scale - `calc(44px * var(--scale) * var(--type-scale))`
 * - so the leading literal IS the authored number. A value that is not a literal (a `var()`, a
 * percentage, a `clamp()`) has no authored number here and is skipped rather than guessed.
 */
export function pxValue(value: string): number | null {
  const scaled = /^calc\(\s*(-?[\d.]+)px\s*[*)]/.exec(value);
  if (scaled) return Number(scaled[1]);
  const literal = /^(-?[\d.]+)px$/.exec(value);
  if (literal) return Number(literal[1]);
  // A bare `0` is the one length CSS lets you write without a unit, and the catalog writes it
  // often - `padding: 0 calc(35px * var(--scale))` is how a strap spends WIDTH and no height.
  // Reading it as "no authored number" threw the whole declaration away, and 46 real horizontal
  // paddings with it.
  return /^-?0(?:\.0+)?$/.test(value) ? 0 : null;
}

/** Split a shorthand into its top-level parts, so `calc(2px * x) calc(3px * y)` is two values
 *  and not four. */
export function shorthandParts(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (/\s/.test(ch) && depth === 0) {
      if (current) parts.push(current);
      current = '';
    } else current += ch;
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * The role word a selector names. Catalog CSS is written `.PREFIX-part`, so the last
 * hyphen-segment of the last prefixed class is what the part IS - `score`, `team`, `name`,
 * `kicker`. It is a common noun, never the selector: the card prints the word and nothing else.
 *
 * Half the catalog writes the prefix as a template hole (`.${P}-kicker`) because the design's
 * prefix is a variable, so the hole is flattened to a letter first. Missing that is not a wrong
 * answer, it is a silently EMPTY one - the competition pack's five categories measured zero
 * roles until this line existed.
 */
export function roleOf(selector: string): string | null {
  const classes = selector.replace(/\$\{[^}]*\}/g, 'x').match(/\.[a-z0-9]+(?:-[a-z0-9]+)+/gi);
  if (!classes) return null;
  const segments = classes[classes.length - 1].toLowerCase().split('-');
  return segments[segments.length - 1] || null;
}

/**
 * Every part ONE rule sets, because a rule can name several. `.x-title, .x-extra { font-size }`
 * is one declaration about two parts, and taking only the last of them measured the title as if
 * it had never been sized - 45 grouped rules ship in the catalog, and each one skewed a role's
 * sample count, its median, and therefore the most-measured-first order the card's cut depends
 * on.
 */
export function rolesOf(selector: string): string[] {
  const roles = selector.split(',').map((part) => roleOf(part)).filter((r): r is string => Boolean(r));
  return [...new Set(roles)];
}

/** A shorthand's values as authored numbers, POSITIONALLY - an unreadable one stays in place as
 *  null so a following value never slides into the wrong slot. An absent declaration is empty. */
function lengths(value: string | undefined): (number | null)[] {
  return value ? shorthandParts(value).map(pxValue) : [];
}

/** Every `selector { ... }` rule in a stylesheet, flat. At-rule headers start with `@` and are
 *  skipped; the rules nested inside them are read like any other. */
const RULE_PATTERN = /(?:^|\n)([^\n{}@][^{}]*)\{([^{}]*)\}/g;

/**
 * A template hole is BRACES, and braces are how a rule is found - so `.${P}-kicker { ... }` does
 * not read as a rule at all until the hole is flattened. Half the catalog writes its prefix that
 * way, and the whole competition pack measured empty until this ran first.
 */
export function flattenTemplateHoles(css: string): string {
  return css.replace(/\$\{[^{}]*\}/g, 'x');
}

/**
 * Read one design stylesheet.
 *
 * Comments go FIRST, whole, rather than being trimmed off the tail of each value: the house
 * style puts a `/* ... *\/` on nearly every line, and a value read with its comment still
 * attached is a value that parses as nothing. Dropping them up front is also what lets a
 * declaration span LINES, which two shipped four-value paddings do - a newline-bounded value
 * pattern lost both of them silently, one of them in a lower-third shared file.
 */
export function measureCss(source: string): CssMeasurement {
  const out = emptyMeasurement();
  const css = flattenTemplateHoles(source).replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const rule of css.matchAll(RULE_PATTERN)) {
    const selector = rule[1].trim();
    const declarations = new Map<string, string>();
    for (const d of rule[2].matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)) {
      declarations.set(d[1], d[2].trim().replace(/\s+/g, ' '));
    }
    const fontSize = declarations.get('font-size');
    if (fontSize) {
      const px = pxValue(fontSize);
      if (px !== null && px > 0) for (const role of rolesOf(selector)) (out.fontByRole[role] ??= []).push(px);
    }
    // `padding: A` is both axes; `A B` (and `A B C D`) is block then inline, CSS's own order.
    // The lengths stay POSITIONAL - dropping an unreadable one would slide the next value into
    // the axis it does not belong to, which is worse than measuring nothing.
    const padding = lengths(declarations.get('padding'));
    if (padding[0] !== null && padding[0] !== undefined) {
      out.paddingBlock.push(padding[0]);
      const inline = padding.length > 1 ? padding[1] : padding[0];
      if (inline !== null && inline !== undefined) out.paddingInline.push(inline);
    }
    for (const gap of lengths(declarations.get('gap'))) if (gap !== null) out.gap.push(gap);
    const radius = lengths(declarations.get('border-radius'))[0];
    if (radius !== null && radius !== undefined) out.radius.push(radius);
    const tracking = declarations.get('letter-spacing');
    if (tracking) {
      const em = /^(-?[\d.]+)em$/.exec(tracking);
      if (em) out.tracking.push(Number(em[1]));
    }
    const lineHeight = declarations.get('line-height');
    if (lineHeight) {
      const unitless = /^([\d.]+)$/.exec(lineHeight);
      if (unitless) out.lineHeight.push(Number(unitless[1]));
    }
  }
  return out;
}

export function mergeMeasurements(parts: readonly CssMeasurement[]): CssMeasurement {
  const out = emptyMeasurement();
  for (const part of parts) {
    for (const [role, sizes] of Object.entries(part.fontByRole)) (out.fontByRole[role] ??= []).push(...sizes);
    for (const key of SAMPLE_KEYS) out[key].push(...part[key]);
  }
  return out;
}

/** min / median / max over the samples, or null when there are none. Rounded to 3 decimals so
 *  the em and line-height spreads do not carry float noise into a checked-in constant.
 *
 *  An EVEN sample count averages the two middles rather than taking the lower one. Taking the
 *  lower made every two-sample spread print its middle ON its own floor - "0.03em to 0.12em,
 *  middle 0.03em" reads to a model as a distribution piled at the bottom, which is a claim the
 *  two samples do not support. */
export function spread(samples: readonly number[]): Spread | null {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const mid = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    n: sorted.length,
    min: round(sorted[0]),
    median: round(median),
    max: round(sorted[sorted.length - 1]),
  };
}

/** Reduce one category's raw measurement to the card's numbers. */
export function reduceCorpus(
  meta: { category: string; typeIds: readonly string[]; designs: number; files: number },
  measured: CssMeasurement,
): ExemplarCorpus {
  const typeSizes = Object.entries(measured.fontByRole)
    .map(([role, sizes]) => ({ role, sizes: spread(sizes)! }))
    .filter((entry) => entry.sizes.n >= MIN_ROLE_SAMPLES)
    // Most-measured first: the parts the category is actually made of, then the trimmed tail.
    // Ties break on the role word so the derivation is stable across platforms.
    .sort((a, b) => b.sizes.n - a.sizes.n || a.role.localeCompare(b.role))
    .slice(0, MAX_ROLES);
  return {
    category: meta.category,
    typeIds: [...meta.typeIds].sort(),
    designs: meta.designs,
    files: meta.files,
    typeSizes,
    paddingBlock: spread(measured.paddingBlock),
    paddingInline: spread(measured.paddingInline),
    gap: spread(measured.gap),
    radius: spread(measured.radius),
    tracking: spread(measured.tracking),
    lineHeight: spread(measured.lineHeight),
  };
}

/** A category with nothing worth showing is not worth a card - it would spend prompt on an
 *  empty table and teach the model that the corpus has nothing to say. */
export function isCardWorthy(corpus: ExemplarCorpus): boolean {
  return corpus.typeSizes.length >= 2;
}

// ── The corpus ──────────────────────────────────────────────────────────────────────────────
// DERIVED, NOT WRITTEN. `scripts/pro-harness-exemplars.test.mjs` re-derives this from the live
// catalog and the designs' own sources and fails on any difference; when a catalog change moves
// a number, the test prints the regenerated block and where it wrote it.

export const EXEMPLAR_CORPORA: readonly ExemplarCorpus[] = [
  {"category":"alert","typeIds":["alert-level"],"designs":13,"files":15,"typeSizes":[{"role":"name","sizes":{"n":13,"min":20,"median":40,"max":64}},{"role":"title","sizes":{"n":13,"min":20,"median":30,"max":47}},{"role":"extra","sizes":{"n":12,"min":20,"median":20,"max":30}},{"role":"flag","sizes":{"n":5,"min":22,"median":30,"max":38}}],"paddingBlock":{"n":21,"min":0,"median":23,"max":49},"paddingInline":{"n":21,"min":0,"median":35,"max":96},"gap":{"n":11,"min":5,"median":9,"max":26},"radius":null,"tracking":{"n":2,"min":0.03,"median":0.075,"max":0.12},"lineHeight":{"n":26,"min":1.06,"median":1.215,"max":1.4}},
  {"category":"corner-bug","typeIds":["award-bug","event-bug","live-bug","logo-bug","sponsor-bug","sponsor-rotator","sponsor-strip","station-bug","status-chip"],"designs":37,"files":45,"typeSizes":[{"role":"name","sizes":{"n":32,"min":16,"median":16,"max":30}},{"role":"extra","sizes":{"n":16,"min":16,"median":16,"max":24}},{"role":"title","sizes":{"n":16,"min":16,"median":16,"max":24}}],"paddingBlock":{"n":30,"min":8,"median":14.5,"max":20},"paddingInline":{"n":30,"min":9,"median":21.5,"max":30},"gap":{"n":34,"min":6,"median":15,"max":38},"radius":{"n":7,"min":3,"median":12,"max":999},"tracking":{"n":1,"min":0.06,"median":0.06,"max":0.06},"lineHeight":{"n":51,"min":1,"median":1.2,"max":1.3}},
  {"category":"end-credits","typeIds":[],"designs":12,"files":15,"typeSizes":[{"role":"entry","sizes":{"n":13,"min":28,"median":38,"max":65}},{"role":"heading","sizes":{"n":12,"min":23,"median":25,"max":38}},{"role":"year","sizes":{"n":12,"min":21,"median":25,"max":33}},{"role":"name","sizes":{"n":11,"min":28,"median":35,"max":43}},{"role":"role","sizes":{"n":11,"min":20,"median":21,"max":53}},{"role":"slot","sizes":{"n":10,"min":20,"median":20,"max":20}}],"paddingBlock":{"n":38,"min":0,"median":10.5,"max":90},"paddingInline":{"n":38,"min":0,"median":0,"max":80},"gap":{"n":19,"min":10,"median":25,"max":45},"radius":{"n":6,"min":0,"median":1.5,"max":18},"tracking":{"n":23,"min":0.03,"median":0.1,"max":0.2},"lineHeight":{"n":28,"min":1.1,"median":1.25,"max":1.4}},
  {"category":"esports-score","typeIds":["esports-score","map-round"],"designs":9,"files":12,"typeSizes":[{"role":"figure","sizes":{"n":4,"min":38,"median":45.5,"max":50}},{"role":"index","sizes":{"n":4,"min":20,"median":20,"max":20}},{"role":"map","sizes":{"n":4,"min":20,"median":23,"max":24}},{"role":"mark","sizes":{"n":4,"min":20,"median":20,"max":20}},{"role":"stage","sizes":{"n":4,"min":20,"median":20,"max":21}},{"role":"status","sizes":{"n":4,"min":20,"median":20,"max":20}},{"role":"team","sizes":{"n":4,"min":35,"median":39,"max":43}},{"role":"title","sizes":{"n":4,"min":20,"median":25.5,"max":28}}],"paddingBlock":{"n":17,"min":4,"median":10,"max":23},"paddingInline":{"n":17,"min":12,"median":19,"max":38},"gap":{"n":17,"min":3,"median":14,"max":25},"radius":{"n":11,"min":3,"median":13,"max":999},"tracking":{"n":12,"min":0.02,"median":0.18,"max":0.22},"lineHeight":{"n":9,"min":1,"median":1,"max":1.1}},
  {"category":"frame","typeIds":[],"designs":15,"files":8,"typeSizes":[{"role":"name","sizes":{"n":6,"min":34,"median":36.5,"max":47}},{"role":"role","sizes":{"n":6,"min":20,"median":20,"max":21}}],"paddingBlock":{"n":7,"min":5,"median":12,"max":24},"paddingInline":{"n":7,"min":10,"median":22,"max":30},"gap":{"n":6,"min":4,"median":10,"max":16},"radius":{"n":2,"min":0,"median":1.5,"max":3},"tracking":null,"lineHeight":{"n":17,"min":1,"median":1.15,"max":1.3}},
  {"category":"game-timer","typeIds":["countdown"],"designs":6,"files":9,"typeSizes":[{"role":"clock","sizes":{"n":6,"min":58,"median":84,"max":98}},{"role":"label","sizes":{"n":3,"min":20,"median":20,"max":20}},{"role":"mask","sizes":{"n":3,"min":20,"median":26,"max":58}}],"paddingBlock":{"n":5,"min":12,"median":19,"max":26},"paddingInline":{"n":5,"min":36,"median":40,"max":46},"gap":{"n":2,"min":11,"median":17.5,"max":24},"radius":{"n":2,"min":60,"median":529.5,"max":999},"tracking":{"n":5,"min":0.01,"median":0.01,"max":0.02},"lineHeight":{"n":9,"min":1,"median":1.12,"max":1.3}},
  {"category":"info-card","typeIds":["headline-card","listing-card","notice-card","now-next","offer-card","process-steps","product-card","qr-card","statement-card","title-card","topic-card"],"designs":83,"files":78,"typeSizes":[{"role":"title","sizes":{"n":27,"min":21,"median":27,"max":92}},{"role":"extra","sizes":{"n":18,"min":20,"median":24,"max":32}},{"role":"name","sizes":{"n":18,"min":20,"median":48,"max":96}},{"role":"detail","sizes":{"n":14,"min":20,"median":20.5,"max":26}},{"role":"label","sizes":{"n":11,"min":20,"median":20,"max":20}},{"role":"kicker","sizes":{"n":9,"min":20,"median":20,"max":26}},{"role":"claim","sizes":{"n":5,"min":47,"median":72,"max":78}},{"role":"head","sizes":{"n":5,"min":33,"median":36,"max":43}}],"paddingBlock":{"n":66,"min":0,"median":24,"max":72},"paddingInline":{"n":66,"min":0,"median":35,"max":250},"gap":{"n":27,"min":10,"median":18,"max":33},"radius":{"n":11,"min":3,"median":4,"max":999},"tracking":{"n":35,"min":-0.02,"median":0.03,"max":0.1},"lineHeight":{"n":161,"min":0.8,"median":1.25,"max":1.45}},
  {"category":"infographic","typeIds":["agenda","fixtures","goal-meter","key-facts","milestone-track","poll","recap-card"],"designs":39,"files":49,"typeSizes":[{"role":"heading","sizes":{"n":15,"min":20,"median":20,"max":54}},{"role":"value","sizes":{"n":12,"min":22,"median":75,"max":150}},{"role":"label","sizes":{"n":11,"min":20,"median":22,"max":50}},{"role":"kicker","sizes":{"n":10,"min":20,"median":20,"max":24}},{"role":"mid","sizes":{"n":8,"min":20,"median":21.5,"max":25}},{"role":"unit","sizes":{"n":6,"min":20,"median":34.5,"max":44}},{"role":"line","sizes":{"n":5,"min":20,"median":21,"max":22}},{"role":"sub","sizes":{"n":5,"min":20,"median":20,"max":20}}],"paddingBlock":{"n":51,"min":0,"median":24,"max":40},"paddingInline":{"n":51,"min":0,"median":32,"max":124},"gap":{"n":51,"min":4,"median":23,"max":38},"radius":{"n":7,"min":2,"median":8,"max":999},"tracking":{"n":17,"min":-0.02,"median":-0.01,"max":0.09},"lineHeight":{"n":89,"min":0.94,"median":1.2,"max":1.35}},
  {"category":"lower-third","typeIds":["call-to-action","lower-third","social-bug"],"designs":101,"files":108,"typeSizes":[{"role":"name","sizes":{"n":94,"min":20,"median":48,"max":68}},{"role":"title","sizes":{"n":77,"min":20,"median":24,"max":49}},{"role":"extra","sizes":{"n":55,"min":20,"median":20,"max":48}},{"role":"role","sizes":{"n":7,"min":20,"median":24,"max":26}},{"role":"action","sizes":{"n":4,"min":20,"median":22,"max":64}},{"role":"clock","sizes":{"n":4,"min":20,"median":31.5,"max":65}},{"role":"target","sizes":{"n":4,"min":31,"median":36,"max":40}},{"role":"reason","sizes":{"n":3,"min":20,"median":20,"max":20}}],"paddingBlock":{"n":122,"min":0,"median":18,"max":58},"paddingInline":{"n":122,"min":0,"median":34,"max":224},"gap":{"n":42,"min":4,"median":14,"max":30},"radius":{"n":14,"min":2,"median":10.5,"max":999},"tracking":{"n":35,"min":-0.02,"median":0.02,"max":0.22},"lineHeight":{"n":274,"min":0.72,"median":1.2,"max":1.45}},
  {"category":"matchup","typeIds":["head-to-head","matchup","player-card"],"designs":12,"files":15,"typeSizes":[{"role":"name","sizes":{"n":12,"min":43,"median":76.5,"max":95}},{"role":"event","sizes":{"n":8,"min":23,"median":25,"max":33}},{"role":"label","sizes":{"n":8,"min":20,"median":20,"max":20}},{"role":"value","sizes":{"n":8,"min":35,"median":44.5,"max":55}},{"role":"note","sizes":{"n":4,"min":20,"median":20,"max":21}},{"role":"role","sizes":{"n":4,"min":22,"median":23.5,"max":28}},{"role":"tagline","sizes":{"n":4,"min":20,"median":20,"max":20}},{"role":"verdict","sizes":{"n":4,"min":20,"median":20,"max":20}}],"paddingBlock":{"n":26,"min":0,"median":10,"max":35},"paddingInline":{"n":22,"min":10,"median":18,"max":38},"gap":{"n":13,"min":2,"median":18,"max":60},"radius":{"n":20,"min":4,"median":18,"max":999},"tracking":{"n":17,"min":0.04,"median":0.18,"max":0.24},"lineHeight":{"n":24,"min":1,"median":1,"max":1.06}},
  {"category":"poll","typeIds":["live-poll"],"designs":5,"files":8,"typeSizes":[{"role":"value","sizes":{"n":10,"min":23,"median":28,"max":34}},{"role":"foot","sizes":{"n":5,"min":20,"median":20,"max":20}},{"role":"label","sizes":{"n":5,"min":23,"median":24,"max":26}},{"role":"mask","sizes":{"n":5,"min":38,"median":40,"max":43}},{"role":"text","sizes":{"n":5,"min":20,"median":20,"max":21}}],"paddingBlock":{"n":8,"min":6,"median":30,"max":35},"paddingInline":{"n":8,"min":14,"median":48,"max":55},"gap":{"n":9,"min":14,"median":19,"max":20},"radius":{"n":9,"min":4,"median":8,"max":999},"tracking":{"n":1,"min":0.04,"median":0.04,"max":0.04},"lineHeight":{"n":10,"min":1.12,"median":1.175,"max":1.2}},
  {"category":"public-info","typeIds":["public-notice"],"designs":12,"files":15,"typeSizes":[{"role":"source","sizes":{"n":10,"min":20,"median":20,"max":25}},{"role":"kicker","sizes":{"n":9,"min":20,"median":20,"max":22}},{"role":"body","sizes":{"n":8,"min":33,"median":35,"max":38}}],"paddingBlock":{"n":15,"min":6,"median":35,"max":43},"paddingInline":{"n":15,"min":15,"median":40,"max":50},"gap":{"n":15,"min":3,"median":20,"max":50},"radius":{"n":2,"min":5,"median":6.5,"max":8},"tracking":null,"lineHeight":{"n":15,"min":1.24,"median":1.32,"max":1.38}},
  {"category":"quiz","typeIds":["answer-board-2","answer-board-3","quiz-board"],"designs":12,"files":16,"typeSizes":[{"role":"letter","sizes":{"n":12,"min":20,"median":21,"max":26}},{"role":"mask","sizes":{"n":12,"min":36,"median":38,"max":40}},{"role":"text","sizes":{"n":12,"min":22,"median":25,"max":28}}],"paddingBlock":{"n":20,"min":6,"median":30,"max":33},"paddingInline":{"n":20,"min":0,"median":40,"max":48},"gap":{"n":14,"min":12,"median":12.5,"max":20},"radius":{"n":18,"min":0,"median":6,"max":12},"tracking":{"n":3,"min":0.04,"median":0.04,"max":0.04},"lineHeight":{"n":23,"min":1.15,"median":1.15,"max":1.25}},
  {"category":"results-board","typeIds":["bracket","roster","standings","timing-tower"],"designs":17,"files":20,"typeSizes":[{"role":"name","sizes":{"n":16,"min":20,"median":29,"max":33}},{"role":"title","sizes":{"n":16,"min":31,"median":39.5,"max":48}},{"role":"index","sizes":{"n":12,"min":20,"median":20,"max":24}},{"role":"kicker","sizes":{"n":12,"min":20,"median":20,"max":20}},{"role":"cell","sizes":{"n":4,"min":24,"median":25,"max":28}},{"role":"champion","sizes":{"n":4,"min":20,"median":20,"max":20}},{"role":"col","sizes":{"n":4,"min":20,"median":20,"max":20}},{"role":"note","sizes":{"n":4,"min":20,"median":20,"max":20}}],"paddingBlock":{"n":39,"min":2,"median":10,"max":30},"paddingInline":{"n":39,"min":0,"median":18,"max":33},"gap":{"n":24,"min":6,"median":20,"max":24},"radius":{"n":24,"min":4,"median":14,"max":999},"tracking":{"n":10,"min":0.08,"median":0.16,"max":0.2},"lineHeight":{"n":32,"min":1.05,"median":1.09,"max":1.5}},
  {"category":"reveal","typeIds":["award-reveal","nominee-reveal","verdict-card","winner-card"],"designs":16,"files":19,"typeSizes":[{"role":"kicker","sizes":{"n":16,"min":20,"median":23,"max":28}},{"role":"title","sizes":{"n":16,"min":48,"median":55,"max":110}},{"role":"note","sizes":{"n":12,"min":20,"median":20,"max":20}},{"role":"subject","sizes":{"n":8,"min":58,"median":81.5,"max":115}},{"role":"detail","sizes":{"n":4,"min":20,"median":20,"max":20}},{"role":"mark","sizes":{"n":4,"min":132,"median":156.5,"max":188}},{"role":"name","sizes":{"n":4,"min":43,"median":44.5,"max":48}},{"role":"runner","sizes":{"n":4,"min":22,"median":23,"max":25}}],"paddingBlock":{"n":13,"min":5,"median":13,"max":38},"paddingInline":{"n":13,"min":8,"median":25,"max":55},"gap":{"n":3,"min":4,"median":12,"max":18},"radius":{"n":9,"min":0,"median":999,"max":999},"tracking":{"n":14,"min":0.16,"median":0.2,"max":0.24},"lineHeight":{"n":32,"min":0.9,"median":1.04,"max":1.12}},
  {"category":"scoreboard","typeIds":["match-board","match-event","match-status","podium-score","scoreboard","scorebug","speaking-timer"],"designs":26,"files":35,"typeSizes":[{"role":"score","sizes":{"n":26,"min":20,"median":43.5,"max":80}},{"role":"team","sizes":{"n":21,"min":24,"median":35,"max":48}},{"role":"clock","sizes":{"n":11,"min":21,"median":32,"max":62}},{"role":"phase","sizes":{"n":11,"min":20,"median":20,"max":26}},{"role":"dash","sizes":{"n":5,"min":38,"median":42,"max":50}},{"role":"label","sizes":{"n":5,"min":20,"median":20,"max":20}},{"role":"name","sizes":{"n":5,"min":20,"median":25,"max":46}},{"role":"club","sizes":{"n":4,"min":24,"median":32,"max":34}}],"paddingBlock":{"n":61,"min":0,"median":13,"max":30},"paddingInline":{"n":61,"min":0,"median":25,"max":44},"gap":{"n":70,"min":1,"median":15,"max":44},"radius":{"n":9,"min":2,"median":6,"max":999},"tracking":{"n":9,"min":-0.005,"median":0.04,"max":0.2},"lineHeight":{"n":98,"min":1,"median":1.1,"max":1.35}},
  {"category":"starting-soon","typeIds":["holding-screen","sign-off"],"designs":21,"files":26,"typeSizes":[{"role":"clock","sizes":{"n":15,"min":24,"median":46,"max":280}},{"role":"show","sizes":{"n":15,"min":30,"median":68,"max":96}},{"role":"note","sizes":{"n":9,"min":24,"median":26,"max":30}},{"role":"kicker","sizes":{"n":8,"min":20,"median":22.5,"max":28}},{"role":"title","sizes":{"n":7,"min":22,"median":24,"max":112}},{"role":"label","sizes":{"n":6,"min":20,"median":23,"max":58}},{"role":"message","sizes":{"n":4,"min":68,"median":71,"max":78}},{"role":"next","sizes":{"n":4,"min":24,"median":24,"max":25}}],"paddingBlock":{"n":28,"min":0,"median":27,"max":62},"paddingInline":{"n":28,"min":14,"median":56,"max":140},"gap":{"n":11,"min":14,"median":18,"max":33},"radius":{"n":8,"min":0,"median":502.5,"max":999},"tracking":{"n":17,"min":-0.02,"median":0.04,"max":0.06},"lineHeight":{"n":61,"min":0.86,"median":1.1,"max":1.4}},
  {"category":"stream-notification","typeIds":["event-notification"],"designs":4,"files":2,"typeSizes":[{"role":"actor","sizes":{"n":4,"min":44,"median":47,"max":52}},{"role":"message","sizes":{"n":4,"min":22,"median":23,"max":23}}],"paddingBlock":{"n":6,"min":5,"median":17,"max":20},"paddingInline":{"n":6,"min":0,"median":19.5,"max":30},"gap":{"n":7,"min":8,"median":14,"max":22},"radius":{"n":1,"min":999,"median":999,"max":999},"tracking":{"n":3,"min":-0.08,"median":0.015,"max":0.02},"lineHeight":{"n":9,"min":0.96,"median":1.06,"max":1.32}},
  {"category":"ticker","typeIds":["ticker"],"designs":22,"files":26,"typeSizes":[{"role":"item","sizes":{"n":20,"min":24,"median":28,"max":33}},{"role":"label","sizes":{"n":20,"min":20,"median":21.5,"max":28}},{"role":"sep","sizes":{"n":9,"min":20,"median":20,"max":24}},{"role":"cap","sizes":{"n":5,"min":20,"median":20,"max":20}}],"paddingBlock":{"n":34,"min":0,"median":0,"max":20},"paddingInline":{"n":34,"min":15,"median":34,"max":43},"gap":{"n":15,"min":6,"median":18,"max":30},"radius":{"n":3,"min":999,"median":999,"max":999},"tracking":{"n":7,"min":0.01,"median":0.03,"max":0.14},"lineHeight":{"n":8,"min":1.2,"median":1.255,"max":1.3}},
];

// ── Lookup and rendering ────────────────────────────────────────────────────────────────────

// TWO MAPS, AND THE TYPE WINS - because one string can be both, and they are not the same
// answer. `poll` is a graphic TYPE whose designs sit among the 39 infographics, AND a wizard
// CATEGORY of five designs of a different type. One map resolved it by whichever entry was
// written last, so a request naming the type read the five-design corpus that is not its own.
// `typeId` is the field the request carries, so the type is what it means.
const BY_TYPE = new Map<string, ExemplarCorpus>();
const BY_CATEGORY = new Map<string, ExemplarCorpus>();
for (const corpus of EXEMPLAR_CORPORA) {
  BY_CATEGORY.set(corpus.category, corpus);
  for (const typeId of corpus.typeIds) {
    // A type declared in two categories takes the larger corpus, then the alphabetically first,
    // so the answer never depends on the order the table happens to be written in.
    const held = BY_TYPE.get(typeId);
    const wins = !held
      || corpus.designs > held.designs
      || (corpus.designs === held.designs && corpus.category < held.category);
    if (wins) BY_TYPE.set(typeId, corpus);
  }
}

/** The corpus for a graphic type id, else a wizard category id; null when neither is known. */
export function exemplarFor(key: string | null | undefined): ExemplarCorpus | null {
  if (!key) return null;
  return BY_TYPE.get(key) ?? BY_CATEGORY.get(key) ?? null;
}

/** The corpus for a wizard CATEGORY id only - the other half of the `poll` collision. A caller
 *  that names a category means the category, and must not be answered with a type's corpus. */
export function exemplarForCategory(key: string | null | undefined): ExemplarCorpus | null {
  if (!key) return null;
  return BY_CATEGORY.get(key) ?? null;
}

/** `lower-third` -> `lower third`. The category id is the only name the card uses, and it is a
 *  kind of graphic rather than any design's name. */
function categoryLabel(category: string): string {
  return category.split('-').join(' ');
}

function describeSpread(value: Spread | null, unit: string): string | null {
  if (!value) return null;
  const show = (n: number) => (unit === 'px' && n === PILL_RADIUS ? 'a full pill' : `${n}${unit}`);
  if (value.min === value.max) return `${show(value.min)} (n ${value.n})`;
  return `${show(value.min)} to ${show(value.max)}, middle ${show(value.median)} (n ${value.n})`;
}

/**
 * The card. First line says what kind of fact this is, because everything else in the prompt is
 * a rule and a model that reads an observation as a rule will design to the median.
 */
export function renderExemplarCard(corpus: ExemplarCorpus): string {
  const label = categoryLabel(corpus.category);
  const lines: string[] = [
    `# What the shipped ${label} graphics measure`,
    '',
    `Not rules and not floors - a MEASUREMENT of the ${corpus.designs} ${label} designs already in`,
    `the NoaCG catalog, read out of their stylesheets. Every number is px at the 1920x1080`,
    `reference, before any runtime scale, with n saying how many declarations it came from. The`,
    `legibility rules above bind; the taste ranges above are ratified. These only say where`,
    `shipped work landed, and a good design sits outside any of them when its brief says so.`,
    '',
    'Type sizes, by the part they set:',
  ];
  for (const entry of corpus.typeSizes) {
    lines.push(`- ${entry.role}: ${describeSpread(entry.sizes, 'px')}`);
  }
  const spacing: string[] = [];
  const block = describeSpread(corpus.paddingBlock, 'px');
  const inline = describeSpread(corpus.paddingInline, 'px');
  if (block) spacing.push(`- padding above and below: ${block}`);
  if (inline) spacing.push(`- padding left and right: ${inline}`);
  const gap = describeSpread(corpus.gap, 'px');
  if (gap) spacing.push(`- gap between elements: ${gap}`);
  const radius = describeSpread(corpus.radius, 'px');
  if (radius) spacing.push(`- corner radius: ${radius}`);
  const tracking = describeSpread(corpus.tracking, 'em');
  if (tracking) spacing.push(`- letter-spacing where it is set at all: ${tracking}`);
  const lineHeight = describeSpread(corpus.lineHeight, '');
  if (lineHeight) spacing.push(`- line-height: ${lineHeight}`);
  if (spacing.length) {
    lines.push('', 'Spacing and shape:', ...spacing);
  }
  return lines.join('\n');
}

/** The card for a request, or an empty string when the request named no kind of graphic - a
 *  brief with no type gets nothing new, because a corpus picked by guesswork is an anchor. */
export function exemplarCardFor(request: { typeId?: string | null; category?: string | null }): string {
  const corpus = exemplarFor(request.typeId) ?? exemplarForCategory(request.category);
  if (!corpus || !isCardWorthy(corpus)) return '';
  return renderExemplarCard(corpus);
}
