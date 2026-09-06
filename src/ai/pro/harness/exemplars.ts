// EXEMPLAR MEASUREMENTS - what the shipped catalog ACTUALLY SET, per kind of graphic
// (docs/PRO_HARNESS_PLAN.md §3.4). The third kind of number the harness hands a model, and it is
// a different KIND of fact from the other two:
//
//   src/model/designRules.ts  the legibility FLOORS - measured on a screen, ratified, binding.
//   knowledge.ts              the taste RANGES of docs/DESIGN_LANGUAGE.md - ratified, advisory.
//   this module               the CORPUS - what 504 shipped designs typed into their own CSS.
//
// A range says "a name sits around 44-92px". This says "across the 26 shipped scoreboards the
// score figure ranges 20-80px and the middle one is 44px, from 26 declarations". The second is
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

/** A measured spread. `median` is the middle sample, not a mean - one outlier must not move it. */
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

export function emptyMeasurement(): CssMeasurement {
  return { fontByRole: {}, paddingBlock: [], paddingInline: [], gap: [], radius: [], tracking: [], lineHeight: [] };
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
  return literal ? Number(literal[1]) : null;
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

/** Read one design stylesheet. Comments after a declaration are dropped, which is why the house
 *  style of a trailing `/* ... *\/` on every line costs nothing here. */
export function measureCss(source: string): CssMeasurement {
  const out = emptyMeasurement();
  const css = flattenTemplateHoles(source);
  for (const rule of css.matchAll(RULE_PATTERN)) {
    const selector = rule[1].trim();
    const declarations = new Map<string, string>();
    for (const d of rule[2].matchAll(/([a-z-]+)\s*:\s*([^;\n]+);/g)) {
      declarations.set(d[1], d[2].split('/*')[0].trim());
    }
    const fontSize = declarations.get('font-size');
    if (fontSize) {
      const px = pxValue(fontSize);
      const role = roleOf(selector);
      if (px !== null && px > 0 && role) (out.fontByRole[role] ??= []).push(px);
    }
    const padding = declarations.get('padding');
    if (padding) {
      const parts = shorthandParts(padding).map(pxValue);
      if (parts[0] !== null && parts[0] !== undefined) {
        out.paddingBlock.push(parts[0]);
        const inline = parts.length > 1 ? parts[1] : parts[0];
        if (inline !== null && inline !== undefined) out.paddingInline.push(inline);
      }
    }
    const gap = declarations.get('gap');
    if (gap) for (const part of shorthandParts(gap).map(pxValue)) if (part !== null) out.gap.push(part);
    const radius = declarations.get('border-radius');
    if (radius) {
      const first = pxValue(shorthandParts(radius)[0] ?? '');
      if (first !== null) out.radius.push(first);
    }
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
    out.paddingBlock.push(...part.paddingBlock);
    out.paddingInline.push(...part.paddingInline);
    out.gap.push(...part.gap);
    out.radius.push(...part.radius);
    out.tracking.push(...part.tracking);
    out.lineHeight.push(...part.lineHeight);
  }
  return out;
}

/** min / median / max over the samples, or null when there are none. Rounded to 3 decimals so
 *  the em and line-height spreads do not carry float noise into a checked-in constant. */
export function spread(samples: readonly number[]): Spread | null {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    n: sorted.length,
    min: round(sorted[0]),
    median: round(sorted[Math.floor((sorted.length - 1) / 2)]),
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
  {"category":"alert","typeIds":["alert-level"],"designs":13,"files":15,"typeSizes":[{"role":"name","sizes":{"n":13,"min":20,"median":40,"max":64}},{"role":"title","sizes":{"n":13,"min":20,"median":30,"max":47}},{"role":"extra","sizes":{"n":12,"min":20,"median":20,"max":30}},{"role":"flag","sizes":{"n":5,"min":22,"median":30,"max":38}}],"paddingBlock":{"n":14,"min":4,"median":26,"max":49},"paddingInline":{"n":13,"min":33,"median":38,"max":58},"gap":{"n":11,"min":5,"median":9,"max":26},"radius":null,"tracking":{"n":2,"min":0.03,"median":0.03,"max":0.12},"lineHeight":{"n":26,"min":1.06,"median":1.18,"max":1.4}},
  {"category":"corner-bug","typeIds":["award-bug","event-bug","live-bug","logo-bug","sponsor-bug","sponsor-rotator","sponsor-strip","station-bug","status-chip"],"designs":37,"files":45,"typeSizes":[{"role":"name","sizes":{"n":32,"min":16,"median":16,"max":30}},{"role":"extra","sizes":{"n":16,"min":16,"median":16,"max":24}}],"paddingBlock":{"n":30,"min":8,"median":14,"max":20},"paddingInline":{"n":30,"min":9,"median":21,"max":30},"gap":{"n":34,"min":6,"median":15,"max":38},"radius":{"n":7,"min":3,"median":12,"max":999},"tracking":{"n":1,"min":0.06,"median":0.06,"max":0.06},"lineHeight":{"n":51,"min":1,"median":1.2,"max":1.3}},
  {"category":"end-credits","typeIds":[],"designs":12,"files":15,"typeSizes":[{"role":"entry","sizes":{"n":13,"min":28,"median":38,"max":65}},{"role":"heading","sizes":{"n":12,"min":23,"median":25,"max":38}},{"role":"year","sizes":{"n":12,"min":21,"median":25,"max":33}},{"role":"name","sizes":{"n":11,"min":28,"median":35,"max":43}},{"role":"role","sizes":{"n":11,"min":20,"median":21,"max":53}},{"role":"slot","sizes":{"n":10,"min":20,"median":20,"max":20}}],"paddingBlock":{"n":35,"min":6,"median":11,"max":90},"paddingInline":{"n":12,"min":18,"median":28,"max":80},"gap":{"n":19,"min":10,"median":25,"max":45},"radius":{"n":3,"min":3,"median":3,"max":18},"tracking":{"n":23,"min":0.03,"median":0.1,"max":0.2},"lineHeight":{"n":28,"min":1.1,"median":1.25,"max":1.4}},
  {"category":"esports-score","typeIds":["esports-score","map-round"],"designs":9,"files":12,"typeSizes":[{"role":"figure","sizes":{"n":4,"min":38,"median":43,"max":50}},{"role":"index","sizes":{"n":4,"min":20,"median":20,"max":20}},{"role":"map","sizes":{"n":4,"min":20,"median":23,"max":24}},{"role":"mark","sizes":{"n":4,"min":20,"median":20,"max":20}},{"role":"stage","sizes":{"n":4,"min":20,"median":20,"max":21}},{"role":"status","sizes":{"n":4,"min":20,"median":20,"max":20}},{"role":"team","sizes":{"n":4,"min":35,"median":38,"max":43}},{"role":"title","sizes":{"n":4,"min":20,"median":25,"max":28}}],"paddingBlock":{"n":17,"min":4,"median":10,"max":23},"paddingInline":{"n":17,"min":12,"median":19,"max":38},"gap":{"n":17,"min":3,"median":14,"max":25},"radius":{"n":11,"min":3,"median":13,"max":999},"tracking":{"n":12,"min":0.02,"median":0.18,"max":0.22},"lineHeight":{"n":9,"min":1,"median":1,"max":1.1}},
  {"category":"frame","typeIds":[],"designs":15,"files":8,"typeSizes":[{"role":"name","sizes":{"n":6,"min":34,"median":35,"max":47}},{"role":"role","sizes":{"n":6,"min":20,"median":20,"max":21}}],"paddingBlock":{"n":7,"min":5,"median":12,"max":24},"paddingInline":{"n":7,"min":10,"median":22,"max":30},"gap":{"n":6,"min":4,"median":10,"max":16},"radius":{"n":1,"min":3,"median":3,"max":3},"tracking":null,"lineHeight":{"n":17,"min":1,"median":1.15,"max":1.3}},
  {"category":"game-timer","typeIds":["countdown"],"designs":6,"files":9,"typeSizes":[{"role":"clock","sizes":{"n":6,"min":58,"median":80,"max":98}},{"role":"label","sizes":{"n":3,"min":20,"median":20,"max":20}},{"role":"mask","sizes":{"n":3,"min":20,"median":26,"max":58}}],"paddingBlock":{"n":5,"min":12,"median":19,"max":26},"paddingInline":{"n":5,"min":36,"median":40,"max":46},"gap":{"n":2,"min":11,"median":11,"max":24},"radius":{"n":2,"min":60,"median":60,"max":999},"tracking":{"n":5,"min":0.01,"median":0.01,"max":0.02},"lineHeight":{"n":9,"min":1,"median":1.12,"max":1.3}},
  {"category":"info-card","typeIds":["headline-card","listing-card","notice-card","now-next","offer-card","process-steps","product-card","qr-card","statement-card","title-card","topic-card"],"designs":83,"files":78,"typeSizes":[{"role":"title","sizes":{"n":24,"min":21,"median":31,"max":92}},{"role":"extra","sizes":{"n":18,"min":20,"median":24,"max":32}},{"role":"name","sizes":{"n":18,"min":20,"median":48,"max":96}},{"role":"detail","sizes":{"n":14,"min":20,"median":20,"max":26}},{"role":"label","sizes":{"n":11,"min":20,"median":20,"max":20}},{"role":"kicker","sizes":{"n":8,"min":20,"median":20,"max":26}},{"role":"claim","sizes":{"n":5,"min":47,"median":72,"max":78}},{"role":"head","sizes":{"n":5,"min":33,"median":36,"max":43}}],"paddingBlock":{"n":65,"min":4,"median":24,"max":72},"paddingInline":{"n":60,"min":10,"median":38,"max":250},"gap":{"n":27,"min":10,"median":18,"max":33},"radius":{"n":11,"min":3,"median":4,"max":999},"tracking":{"n":33,"min":-0.02,"median":0.03,"max":0.1},"lineHeight":{"n":159,"min":0.8,"median":1.25,"max":1.45}},
  {"category":"infographic","typeIds":["agenda","fixtures","goal-meter","key-facts","milestone-track","poll","recap-card"],"designs":39,"files":49,"typeSizes":[{"role":"heading","sizes":{"n":15,"min":20,"median":20,"max":54}},{"role":"value","sizes":{"n":12,"min":22,"median":66,"max":150}},{"role":"label","sizes":{"n":11,"min":20,"median":22,"max":50}},{"role":"kicker","sizes":{"n":10,"min":20,"median":20,"max":24}},{"role":"mid","sizes":{"n":8,"min":20,"median":20,"max":25}},{"role":"unit","sizes":{"n":6,"min":20,"median":31,"max":44}},{"role":"line","sizes":{"n":5,"min":20,"median":21,"max":22}},{"role":"sub","sizes":{"n":5,"min":20,"median":20,"max":20}}],"paddingBlock":{"n":50,"min":4,"median":24,"max":40},"paddingInline":{"n":39,"min":10,"median":36,"max":124},"gap":{"n":51,"min":4,"median":23,"max":38},"radius":{"n":7,"min":2,"median":8,"max":999},"tracking":{"n":17,"min":-0.02,"median":-0.01,"max":0.09},"lineHeight":{"n":89,"min":0.94,"median":1.2,"max":1.35}},
  {"category":"lower-third","typeIds":["call-to-action","lower-third","social-bug"],"designs":101,"files":108,"typeSizes":[{"role":"name","sizes":{"n":94,"min":20,"median":48,"max":68}},{"role":"title","sizes":{"n":67,"min":20,"median":25,"max":49}},{"role":"extra","sizes":{"n":55,"min":20,"median":20,"max":48}},{"role":"role","sizes":{"n":7,"min":20,"median":24,"max":26}},{"role":"action","sizes":{"n":4,"min":20,"median":20,"max":64}},{"role":"clock","sizes":{"n":4,"min":20,"median":30,"max":65}},{"role":"target","sizes":{"n":4,"min":31,"median":34,"max":40}},{"role":"reason","sizes":{"n":3,"min":20,"median":20,"max":20}}],"paddingBlock":{"n":120,"min":4,"median":18,"max":58},"paddingInline":{"n":119,"min":12,"median":34,"max":224},"gap":{"n":42,"min":4,"median":14,"max":30},"radius":{"n":14,"min":2,"median":6,"max":999},"tracking":{"n":35,"min":-0.02,"median":0.02,"max":0.22},"lineHeight":{"n":274,"min":0.72,"median":1.2,"max":1.45}},
  {"category":"matchup","typeIds":["head-to-head","matchup","player-card"],"designs":12,"files":15,"typeSizes":[{"role":"name","sizes":{"n":12,"min":43,"median":75,"max":95}},{"role":"event","sizes":{"n":8,"min":23,"median":25,"max":33}},{"role":"label","sizes":{"n":8,"min":20,"median":20,"max":20}},{"role":"value","sizes":{"n":8,"min":35,"median":43,"max":55}},{"role":"note","sizes":{"n":4,"min":20,"median":20,"max":21}},{"role":"role","sizes":{"n":4,"min":22,"median":23,"max":28}},{"role":"tagline","sizes":{"n":4,"min":20,"median":20,"max":20}},{"role":"verdict","sizes":{"n":4,"min":20,"median":20,"max":20}}],"paddingBlock":{"n":22,"min":5,"median":12,"max":35},"paddingInline":{"n":22,"min":10,"median":18,"max":38},"gap":{"n":13,"min":2,"median":18,"max":60},"radius":{"n":20,"min":4,"median":18,"max":999},"tracking":{"n":17,"min":0.04,"median":0.18,"max":0.24},"lineHeight":{"n":24,"min":1,"median":1,"max":1.06}},
  {"category":"poll","typeIds":["live-poll"],"designs":5,"files":8,"typeSizes":[{"role":"value","sizes":{"n":10,"min":23,"median":28,"max":34}},{"role":"foot","sizes":{"n":5,"min":20,"median":20,"max":20}},{"role":"label","sizes":{"n":5,"min":23,"median":24,"max":26}},{"role":"mask","sizes":{"n":5,"min":38,"median":40,"max":43}},{"role":"text","sizes":{"n":5,"min":20,"median":20,"max":21}}],"paddingBlock":{"n":8,"min":6,"median":30,"max":35},"paddingInline":{"n":8,"min":14,"median":48,"max":55},"gap":{"n":9,"min":14,"median":19,"max":20},"radius":{"n":9,"min":4,"median":8,"max":999},"tracking":{"n":1,"min":0.04,"median":0.04,"max":0.04},"lineHeight":{"n":10,"min":1.12,"median":1.15,"max":1.2}},
  {"category":"public-info","typeIds":["public-notice"],"designs":12,"files":15,"typeSizes":[{"role":"source","sizes":{"n":10,"min":20,"median":20,"max":25}},{"role":"kicker","sizes":{"n":9,"min":20,"median":20,"max":22}},{"role":"body","sizes":{"n":8,"min":33,"median":35,"max":38}}],"paddingBlock":{"n":15,"min":6,"median":35,"max":43},"paddingInline":{"n":15,"min":15,"median":40,"max":50},"gap":{"n":15,"min":3,"median":20,"max":50},"radius":{"n":2,"min":5,"median":5,"max":8},"tracking":null,"lineHeight":{"n":15,"min":1.24,"median":1.32,"max":1.38}},
  {"category":"quiz","typeIds":["answer-board-2","answer-board-3","quiz-board"],"designs":12,"files":16,"typeSizes":[{"role":"letter","sizes":{"n":12,"min":20,"median":21,"max":26}},{"role":"mask","sizes":{"n":12,"min":36,"median":38,"max":40}},{"role":"text","sizes":{"n":12,"min":22,"median":25,"max":28}}],"paddingBlock":{"n":20,"min":6,"median":30,"max":33},"paddingInline":{"n":19,"min":18,"median":40,"max":48},"gap":{"n":14,"min":12,"median":12,"max":20},"radius":{"n":15,"min":4,"median":6,"max":12},"tracking":{"n":3,"min":0.04,"median":0.04,"max":0.04},"lineHeight":{"n":23,"min":1.15,"median":1.15,"max":1.25}},
  {"category":"results-board","typeIds":["bracket","roster","standings","timing-tower"],"designs":17,"files":20,"typeSizes":[{"role":"name","sizes":{"n":16,"min":20,"median":29,"max":33}},{"role":"title","sizes":{"n":16,"min":31,"median":39,"max":48}},{"role":"index","sizes":{"n":12,"min":20,"median":20,"max":24}},{"role":"kicker","sizes":{"n":12,"min":20,"median":20,"max":20}},{"role":"cell","sizes":{"n":4,"min":24,"median":25,"max":28}},{"role":"champion","sizes":{"n":4,"min":20,"median":20,"max":20}},{"role":"col","sizes":{"n":4,"min":20,"median":20,"max":20}},{"role":"note","sizes":{"n":4,"min":20,"median":20,"max":20}}],"paddingBlock":{"n":39,"min":2,"median":10,"max":30},"paddingInline":{"n":33,"min":8,"median":18,"max":33},"gap":{"n":24,"min":6,"median":20,"max":24},"radius":{"n":24,"min":4,"median":14,"max":999},"tracking":{"n":10,"min":0.08,"median":0.16,"max":0.2},"lineHeight":{"n":32,"min":1.05,"median":1.08,"max":1.5}},
  {"category":"reveal","typeIds":["award-reveal","nominee-reveal","verdict-card","winner-card"],"designs":16,"files":19,"typeSizes":[{"role":"kicker","sizes":{"n":16,"min":20,"median":23,"max":28}},{"role":"title","sizes":{"n":16,"min":48,"median":55,"max":110}},{"role":"note","sizes":{"n":12,"min":20,"median":20,"max":20}},{"role":"subject","sizes":{"n":8,"min":58,"median":70,"max":115}},{"role":"detail","sizes":{"n":4,"min":20,"median":20,"max":20}},{"role":"mark","sizes":{"n":4,"min":132,"median":138,"max":188}},{"role":"name","sizes":{"n":4,"min":43,"median":44,"max":48}},{"role":"runner","sizes":{"n":4,"min":22,"median":23,"max":25}}],"paddingBlock":{"n":13,"min":5,"median":13,"max":38},"paddingInline":{"n":13,"min":8,"median":25,"max":55},"gap":{"n":3,"min":4,"median":12,"max":18},"radius":{"n":8,"min":8,"median":999,"max":999},"tracking":{"n":14,"min":0.16,"median":0.2,"max":0.24},"lineHeight":{"n":32,"min":0.9,"median":1.04,"max":1.12}},
  {"category":"scoreboard","typeIds":["match-board","match-event","match-status","podium-score","scoreboard","scorebug","speaking-timer"],"designs":26,"files":35,"typeSizes":[{"role":"score","sizes":{"n":26,"min":20,"median":43,"max":80}},{"role":"team","sizes":{"n":21,"min":24,"median":35,"max":48}},{"role":"clock","sizes":{"n":11,"min":21,"median":32,"max":62}},{"role":"phase","sizes":{"n":11,"min":20,"median":20,"max":26}},{"role":"dash","sizes":{"n":5,"min":38,"median":42,"max":50}},{"role":"label","sizes":{"n":5,"min":20,"median":20,"max":20}},{"role":"name","sizes":{"n":5,"min":20,"median":25,"max":46}},{"role":"club","sizes":{"n":4,"min":24,"median":31,"max":34}}],"paddingBlock":{"n":56,"min":2,"median":14,"max":30},"paddingInline":{"n":47,"min":8,"median":30,"max":44},"gap":{"n":70,"min":1,"median":15,"max":44},"radius":{"n":9,"min":2,"median":6,"max":999},"tracking":{"n":9,"min":-0.005,"median":0.04,"max":0.2},"lineHeight":{"n":98,"min":1,"median":1.1,"max":1.35}},
  {"category":"starting-soon","typeIds":["holding-screen","sign-off"],"designs":21,"files":26,"typeSizes":[{"role":"clock","sizes":{"n":15,"min":24,"median":46,"max":280}},{"role":"show","sizes":{"n":15,"min":30,"median":68,"max":96}},{"role":"note","sizes":{"n":9,"min":24,"median":26,"max":30}},{"role":"kicker","sizes":{"n":8,"min":20,"median":21,"max":28}},{"role":"title","sizes":{"n":7,"min":22,"median":24,"max":112}},{"role":"label","sizes":{"n":6,"min":20,"median":20,"max":58}},{"role":"message","sizes":{"n":4,"min":68,"median":70,"max":78}},{"role":"next","sizes":{"n":4,"min":24,"median":24,"max":25}}],"paddingBlock":{"n":26,"min":5,"median":28,"max":62},"paddingInline":{"n":26,"min":14,"median":60,"max":140},"gap":{"n":11,"min":14,"median":18,"max":33},"radius":{"n":6,"min":6,"median":999,"max":999},"tracking":{"n":17,"min":-0.02,"median":0.04,"max":0.06},"lineHeight":{"n":61,"min":0.86,"median":1.1,"max":1.4}},
  {"category":"stream-notification","typeIds":["event-notification"],"designs":4,"files":2,"typeSizes":[{"role":"actor","sizes":{"n":4,"min":44,"median":46,"max":52}},{"role":"message","sizes":{"n":4,"min":22,"median":23,"max":23}}],"paddingBlock":{"n":6,"min":5,"median":16,"max":20},"paddingInline":{"n":5,"min":10,"median":28,"max":30},"gap":{"n":7,"min":8,"median":14,"max":22},"radius":{"n":1,"min":999,"median":999,"max":999},"tracking":{"n":3,"min":-0.08,"median":0.015,"max":0.02},"lineHeight":{"n":9,"min":0.96,"median":1.06,"max":1.32}},
  {"category":"ticker","typeIds":["ticker"],"designs":22,"files":26,"typeSizes":[{"role":"item","sizes":{"n":20,"min":24,"median":28,"max":33}},{"role":"label","sizes":{"n":20,"min":20,"median":21,"max":28}},{"role":"sep","sizes":{"n":9,"min":20,"median":20,"max":24}},{"role":"cap","sizes":{"n":5,"min":20,"median":20,"max":20}}],"paddingBlock":{"n":10,"min":4,"median":16,"max":20},"paddingInline":{"n":10,"min":15,"median":31,"max":36},"gap":{"n":15,"min":6,"median":18,"max":30},"radius":{"n":3,"min":999,"median":999,"max":999},"tracking":{"n":7,"min":0.01,"median":0.03,"max":0.14},"lineHeight":{"n":8,"min":1.2,"median":1.25,"max":1.3}},
];

// ── Lookup and rendering ────────────────────────────────────────────────────────────────────

const BY_KEY = new Map<string, ExemplarCorpus>();
for (const corpus of EXEMPLAR_CORPORA) {
  BY_KEY.set(corpus.category, corpus);
  // A graphic type id resolves to the category its designs live in. A type id that collides with
  // a category id (`scoreboard` is both) is the same answer either way.
  for (const typeId of corpus.typeIds) if (!BY_KEY.has(typeId)) BY_KEY.set(typeId, corpus);
}

/** The corpus for a graphic type id or a wizard category id; null when neither is known. */
export function exemplarFor(key: string | null | undefined): ExemplarCorpus | null {
  if (!key) return null;
  return BY_KEY.get(key) ?? null;
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
  const corpus = exemplarFor(request.typeId) ?? exemplarFor(request.category);
  if (!corpus || !isCardWorthy(corpus)) return '';
  return renderExemplarCard(corpus);
}
