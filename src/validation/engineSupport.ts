// WHICH BROWSER ENGINE A GRAPHIC ACTUALLY NEEDS — and therefore which playout systems can
// render it.
//
// THE PROBLEM THIS EXISTS FOR. CasparCG 2.3.x — the common LTS and teaching install, and the
// one the maintainer runs — carries a Chromium 71 CEF. A modern CSS declaration
// there does not warn and does not degrade: the browser drops the whole declaration and paints
// the element with no background at all. The 2026-08-06 acceptance pass found exactly that on
// the Arena Quiz board — "just the blue line and the numbers", because every answer chip's
// background is a `color-mix()` (Chromium 111) and 2.3.x has never heard of it. Modern JS is
// worse: one `?.` is a SyntaxError that kills the whole file, so the layer goes on air showing
// nothing (docs/PLAYOUT_INTEGRATION.md §3).
//
// So this module MEASURES what a template uses, rather than anyone maintaining a list of which
// designs are known to be broken. A list would be wrong the day after it was written; the scan
// is right by construction because it reads the emitted code.
//
// WHAT IT IS NOT. It is not a validator and it never blocks an export. The output is a VERDICT
// PER TARGET ENGINE, so the user is told before they take it to air rather than finding out on
// a dark layer — including for engines below the supported floor, which are reported honestly
// rather than hidden.
//
// THE FLOOR IS A MACHINE, NOT AN AUDIENCE GUESS (`SUPPORTED_FLOOR`, and
// docs/PLAYOUT_COMPATIBILITY.md). Earlier revisions of this module aimed at CasparCG 2.3 and at
// a guessed OBS/vMix bar. Measured 2026-08-07 on real installs: a current OBS reports Chromium
// 127 and CasparCG 2.5 reports 142, so the binding constraint is not either of those — it is
// CasparCG 2.4 (117), the server the maintainer's school actually runs productions on. The
// catalogue's own ceiling is 111 (`color-mix()`), which clears 117 with room. What the floor
// buys is the three CSS features ABOVE it — relative colour syntax (119), the unprefixed mask
// shorthand (120) and light-dark() (123) — one of which has already put a design on air wrong.
//
// HONEST LIMITS, stated because a compatibility report that overclaims is worse than none:
//  - It is a lexical scan. It reads the emitted CSS and JS with comments and string literals
//    removed; it does not build a CSSOM or parse JS. A feature spelled unusually can be missed.
//  - `gap` is listed at the FLEXBOX bar (Chromium 84) because the scan cannot see whether the
//    element is a flex or a grid container, and grid gap has been supported since 66. It no
//    longer raises a template's required engine, because every composed document and every
//    export carries src/assets/flexGapShim.js, which puts a flex gap back as margins on an
//    engine that lacks it (`effect: 'shimmed'`). It is still LISTED, so a reader who exports the
//    bare html/css for some other host knows the declaration is there.
//  - The versions come from the features' own shipping records. The CasparCG engine mapping
//    comes from the CasparCG changelog (docs/PLAYOUT_INTEGRATION.md §3) — only 2.3.2 has been
//    run on real hardware here.

import type { SpxTemplate } from '../model/types';

/** One thing a template can use that an older engine does not have. */
export interface EngineFeature {
  id: string;
  /** How it reads in a report — the declaration or syntax itself, in the user's words. */
  label: string;
  /** The first Chromium version that shipped it. */
  since: number;
  /** Where the scan looks. */
  where: 'css' | 'js';
  /**
   * What actually happens on an engine that lacks it — the part that decides how loud to be.
   *
   * `cosmetic` is not a softer `drops-the-declaration`; it is a different fact. The engine drops
   * the declaration either way, but for these the result is a typographic nicety nobody would
   * notice was missing (text-wrap: balance rebalances a wrap; text-decoration-thickness changes
   * an underline by a pixel). They are still LISTED, because the scan should never hide what it
   * saw, but they do not raise the graphic's required engine — otherwise one shared base rule
   * would stamp "needs Chromium 114" on all 430 designs and the report would be noise.
   *
   * `shimmed` is the fourth fact: the engine drops the declaration, and a script the studio
   * ships in every document puts the effect back at runtime (flex `gap`, src/assets/
   * flexGapShim.js). Listed like the others, and like `cosmetic` it never raises the bar.
   */
  effect: 'drops-the-declaration' | 'kills-the-file' | 'cosmetic' | 'shimmed';
  test: RegExp;
}

/**
 * The feature table. Ordered by Chromium version so a report reads worst-first.
 *
 * Only features that can plausibly appear in generated or hand-edited template code are listed;
 * this is a template-compatibility scanner, not a general browser-support database. Adding one
 * is a single row — nothing else in the module knows the list.
 */
export const ENGINE_FEATURES: EngineFeature[] = [
  // ── CSS ────────────────────────────────────────────────────────────────────────────────
  { id: 'css-light-dark', label: 'light-dark()', since: 123, where: 'css', effect: 'drops-the-declaration', test: /\blight-dark\s*\(/ },
  { id: 'css-mask', label: 'the unprefixed mask shorthand', since: 120, where: 'css', effect: 'drops-the-declaration', test: /(^|[;{\s])mask(-image|-composite|-mode)?\s*:/m },
  { id: 'css-relative-color', label: 'relative colour syntax (rgb(from …))', since: 119, where: 'css', effect: 'drops-the-declaration', test: /\b(rgb|hsl|oklch|lab)\s*\(\s*from\b/ },
  { id: 'css-text-wrap-balance', label: 'text-wrap: balance', since: 114, where: 'css', effect: 'cosmetic', test: /text-wrap\s*:\s*(balance|pretty)/ },
  { id: 'css-nesting', label: 'CSS nesting', since: 112, where: 'css', effect: 'drops-the-declaration', test: /(?:^|[;{}])\s*&[\s.:[>+~]/m },
  { id: 'css-color-mix', label: 'color-mix()', since: 111, where: 'css', effect: 'drops-the-declaration', test: /\bcolor-mix\s*\(/ },
  { id: 'css-dvh', label: 'the dvh / svh / lvh viewport units', since: 108, where: 'css', effect: 'drops-the-declaration', test: /\d(dvh|svh|lvh|dvw|svw|lvw)\b/ },
  { id: 'css-individual-transforms', label: 'the individual transform properties (translate / rotate / scale)', since: 104, where: 'css', effect: 'drops-the-declaration', test: /(?:^|[;{])\s*(translate|rotate|scale)\s*:\s*[^;}]*(px|deg|rad|turn|%|\d)/m },
  { id: 'css-has', label: ':has()', since: 105, where: 'css', effect: 'drops-the-declaration', test: /:has\s*\(/ },
  { id: 'css-container', label: '@container queries', since: 105, where: 'css', effect: 'drops-the-declaration', test: /@container\b/ },
  { id: 'css-layer', label: '@layer', since: 99, where: 'css', effect: 'drops-the-declaration', test: /@layer\b/ },
  { id: 'css-accent-color', label: 'accent-color', since: 93, where: 'css', effect: 'drops-the-declaration', test: /accent-color\s*:/ },
  { id: 'css-overflow-clip', label: 'overflow: clip', since: 90, where: 'css', effect: 'drops-the-declaration', test: /overflow(-x|-y)?\s*:\s*clip\b/ },
  { id: 'css-aspect-ratio', label: 'aspect-ratio', since: 88, where: 'css', effect: 'drops-the-declaration', test: /(?:^|[;{])\s*aspect-ratio\s*:/m },
  { id: 'css-is-where', label: ':is() / :where()', since: 88, where: 'css', effect: 'drops-the-declaration', test: /:(is|where)\s*\(/ },
  { id: 'css-inset', label: 'the inset shorthand', since: 87, where: 'css', effect: 'drops-the-declaration', test: /(?:^|[;{])\s*inset\s*:/m },
  { id: 'css-text-decoration-thickness', label: 'text-decoration-thickness', since: 87, where: 'css', effect: 'cosmetic', test: /text-decoration-(thickness|skip-ink)\s*:/ },
  { id: 'css-property', label: '@property', since: 85, where: 'css', effect: 'drops-the-declaration', test: /@property\b/ },
  { id: 'css-content-visibility', label: 'content-visibility', since: 85, where: 'css', effect: 'drops-the-declaration', test: /content-visibility\s*:/ },
  { id: 'css-gap', label: 'gap in a flex container', since: 84, where: 'css', effect: 'shimmed', test: /(?:^|[;{])\s*(gap|row-gap|column-gap)\s*:/m },
  { id: 'css-clamp', label: 'clamp() / min() / max()', since: 79, where: 'css', effect: 'drops-the-declaration', test: /\b(clamp|min|max)\s*\(/ },
  { id: 'css-backdrop-filter', label: 'backdrop-filter', since: 76, where: 'css', effect: 'drops-the-declaration', test: /(?:^|[;{])\s*backdrop-filter\s*:/m },
  { id: 'css-conic-gradient', label: 'conic-gradient()', since: 69, where: 'css', effect: 'drops-the-declaration', test: /\bconic-gradient\s*\(/ },

  // ── JS. Every syntax entry KILLS THE FILE on an engine that lacks it, which is why an old
  // CasparCG shows a blank layer rather than a partly-broken graphic. ────────────────────
  { id: 'js-to-sorted', label: 'Array toSorted / toReversed / with', since: 110, where: 'js', effect: 'kills-the-file', test: /\.(toSorted|toReversed|toSpliced)\s*\(/ },
  { id: 'js-abortsignal-timeout', label: 'AbortSignal.timeout', since: 103, where: 'js', effect: 'drops-the-declaration', test: /AbortSignal\s*\.\s*timeout\b/ },
  { id: 'js-structured-clone', label: 'structuredClone', since: 98, where: 'js', effect: 'drops-the-declaration', test: /\bstructuredClone\s*\(/ },
  { id: 'js-find-last', label: 'Array findLast', since: 97, where: 'js', effect: 'drops-the-declaration', test: /\.(findLast|findLastIndex)\s*\(/ },
  { id: 'js-has-own', label: 'Object.hasOwn', since: 93, where: 'js', effect: 'drops-the-declaration', test: /Object\s*\.\s*hasOwn\b/ },
  { id: 'js-at', label: 'Array / String .at()', since: 92, where: 'js', effect: 'drops-the-declaration', test: /\.at\s*\(\s*-?\d/ },
  { id: 'js-top-level-await', label: 'top-level await', since: 89, where: 'js', effect: 'kills-the-file', test: /^\s*await\s/m },
  { id: 'js-replace-all', label: 'String.replaceAll', since: 85, where: 'js', effect: 'drops-the-declaration', test: /\.replaceAll\s*\(/ },
  { id: 'js-logical-assignment', label: 'logical assignment (&&= ||= ??=)', since: 85, where: 'js', effect: 'kills-the-file', test: /(\|\||&&|\?\?)=/ },
  { id: 'js-replace-children', label: 'replaceChildren', since: 86, where: 'js', effect: 'drops-the-declaration', test: /\.replaceChildren\s*\(/ },
  { id: 'js-optional-chaining', label: 'optional chaining (?.)', since: 80, where: 'js', effect: 'kills-the-file', test: /\?\.[\s\w[(]/ },
  { id: 'js-nullish', label: 'the nullish coalescing operator (??)', since: 80, where: 'js', effect: 'kills-the-file', test: /\?\?[^=]/ },
  { id: 'js-numeric-separators', label: 'numeric separators (1_000)', since: 75, where: 'js', effect: 'kills-the-file', test: /\b\d+_\d/ },
  { id: 'js-private-fields', label: 'private class fields (#name)', since: 74, where: 'js', effect: 'kills-the-file', test: /(^|[\s{;])#[A-Za-z_]\w*\s*[=(;]/m },
  { id: 'js-globalthis', label: 'globalThis', since: 71, where: 'js', effect: 'drops-the-declaration', test: /\bglobalThis\b/ },
  { id: 'js-resize-observer', label: 'ResizeObserver', since: 64, where: 'js', effect: 'drops-the-declaration', test: /\bResizeObserver\b/ },
];

/** A playout engine a user might take the graphic to, and the Chromium it renders with. */
export interface PlayoutEngine {
  id: string;
  label: string;
  /** null = it uses whatever browser the operator has, so nothing here can be predicted. */
  chromium: number | null;
  note?: string;
}

/**
 * THE SUPPORTED FLOOR: the oldest browser engine a catalogue template must render correctly on.
 *
 * 117 is CasparCG 2.4 — not an audience estimate, but the server the maintainer's school runs
 * productions on, which makes it the oldest engine anyone here has to satisfy. Everything else
 * measured on 2026-08-07 sits above it: a current OBS reports 127, CasparCG 2.5 reports 142, and
 * SPX renders in the operator's own browser. The catalogue's own ceiling is 111 (`color-mix()`),
 * so it clears this today with six versions to spare.
 *
 * Moving this number is a decision about which machines are supported, so it lives here, once —
 * `scripts/engine-floor.mjs` gates on it and docs/PLAYOUT_COMPATIBILITY.md explains it.
 */
export const SUPPORTED_FLOOR = 117;

/**
 * The engines worth a verdict, from oldest to newest.
 *
 * `measured` rows were read off a real install through the output page's `&debug=1` readout,
 * which prints the engine's own user-agent version. Everything else comes from a changelog and
 * should be treated as approximate until someone points a real machine at that URL.
 *
 * **The CasparCG 2.3 row is MEASURED, and it is 71 - one row, not two.** It used to be two rows,
 * 75 and 88, both inferred and carrying an argument: vite.config.ts lowers the build target to
 * es2017 because a 2.3.2 server could not PARSE optional chaining (below 80), while the
 * 2026-08-06 acceptance pass saw `inset` (87) and flex `gap` (84) render on "a 2.3.x server"
 * (at or above 88). On 2026-09-10 the install named `v2.3.3-lts-stable` reported `Chromium 71`
 * on the output page's own `&debug=1` line, its libcef.dll is CEF 3.3578 (the Chromium 71
 * branch), and the house scorebug aired on it with its flex gaps COLLAPSED, label flush against
 * number, beside the same production on 2.5.0 where they are there. So the low bound was right
 * and the high one described some other machine: the official 2.3.3 LTS release on GitHub
 * (2021-03-16, the one zip a school downloads today) unpacks to a binary that answers `VERSION`
 * with `2.3.2 4de6d18f Dev` and ships that same CEF. There is no 2.3 with Chromium 88 to
 * download, so the row for it is gone.
 *
 * The row stays below the floor, so the report is honest about a machine we do not author for
 * rather than silently omitting it. The number cannot change a verdict for a supported engine -
 * the floor is 117.
 */
export const PLAYOUT_ENGINES: PlayoutEngine[] = [
  { id: 'casparcg-23', label: 'CasparCG 2.3.x', chromium: 71, note: 'measured 2026-09-10 on the 2.3.3 LTS download, below the supported floor' },
  { id: 'obs-30', label: 'OBS Studio 30.x', chromium: 103, note: 'an OBS not updated since 2023 — below the floor' },
  { id: 'vmix', label: 'vMix 27+', chromium: 103, note: 'changelog only, never measured here' },
  { id: 'casparcg-24', label: 'CasparCG 2.4.x', chromium: SUPPORTED_FLOOR, note: 'THE SUPPORTED FLOOR' },
  { id: 'obs', label: 'OBS Studio (current)', chromium: 127, note: 'measured 2026-08-07' },
  { id: 'casparcg-25', label: 'CasparCG 2.5.x', chromium: 142, note: 'measured 2026-08-07' },
  { id: 'browser', label: 'A current browser', chromium: null, note: 'SPX’s own renderer, and the studio preview' },
];

/** One measured use of a feature, with the line it was found on. */
export interface EngineFinding {
  feature: EngineFeature;
  /** 1-based line number within the tab the feature was found in. */
  line: number;
  /** The line itself, trimmed — so a report can show what it actually saw. */
  source: string;
}

export interface EngineSupport {
  /** The lowest Chromium that renders this template as designed. 0 = nothing modern found. */
  minChromium: number;
  findings: EngineFinding[];
}

/**
 * Blank out CSS comments and string literals, keeping the character COUNT and every newline, so
 * line numbers survive. Blanking rather than deleting is what makes the line arithmetic free.
 */
function maskCss(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * The same for JS, plus `//` comments and quoted strings. Template literals are deliberately
 * NOT masked: catalog runtimes build markup in them, and a modern feature used inside one is
 * still shipped to the engine.
 */
function maskJs(js: string): string {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/'(?:\\.|[^'\\\n])*'/g, (m) => `'${' '.repeat(Math.max(0, m.length - 2))}'`)
    .replace(/"(?:\\.|[^"\\\n])*"/g, (m) => `"${' '.repeat(Math.max(0, m.length - 2))}"`);
}

/** The property a CSS line declares, verbatim, or null if the line is not a declaration. */
function declaredProperty(line: string): string | null {
  const m = /^\s*([-\w]+)\s*:/.exec(line);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Standard properties whose `-webkit-` spelling is genuinely OLDER, and therefore usable as a
 * fallback for it.
 *
 * This is a list rather than a prefix-strip, and the difference is load-bearing. An earlier
 * version stripped any vendor prefix when comparing property names, which silently credited
 * `-webkit-backdrop-filter` as a fallback for `backdrop-filter` — but Chromium shipped both
 * spellings at 76, so on an engine below that NEITHER works and the "fallback" is worth
 * nothing. The catalogue has 141 of those pairs; crediting them would have blinded the scanner
 * to `backdrop-filter` across 178 designs while changing nothing on air.
 *
 * Adding a row here needs evidence that the prefixed form actually predates the standard one.
 * The mask family qualifies: `-webkit-mask-image` has worked since Chromium 1, the unprefixed
 * shorthand only since 120.
 */
const OLDER_WHEN_PREFIXED: ReadonlySet<string> = new Set([
  'mask',
  'mask-image',
  'mask-composite',
  'mask-mode',
  'mask-size',
  'mask-repeat',
  'mask-position',
]);

/** Can `prev` stand in for `prop` — the same property, or a genuinely older prefixed spelling? */
function coversProperty(prev: string, prop: string): boolean {
  if (prev === prop) return true;
  return OLDER_WHEN_PREFIXED.has(prop) && prev === `-webkit-${prop}`;
}

/**
 * IS THIS DECLARATION ALREADY COVERED BY A FALLBACK?
 *
 * The CSS cascade's oldest compatibility idiom: write the old value first, the modern one second.
 * An engine that cannot parse the second keeps the first, so nothing is missing — it just does
 * not get the better version. A scanner that reported those as failures would be reporting the
 * FIX as the problem, and once the shared assemblers start emitting fallbacks that is most of
 * the catalogue.
 *
 * "Covered" is deliberately narrow: the immediately preceding declaration in the same block must
 * name the SAME property (or a genuinely older prefixed spelling of it) and must not itself use
 * anything modern. That is the only pattern the cascade actually guarantees, and a looser rule
 * would start excusing real gaps.
 *
 * A CUSTOM PROPERTY IS NEVER COVERED, and that is the subtlest rule here. `--x: <old>` followed
 * by `--x: <modern>` looks exactly like the idiom and is not it: custom properties are raw token
 * streams, so an old engine ACCEPTS the modern one and it wins the cascade. The failure lands
 * later, at `box-shadow: var(--x)` — per CSS Variables Level 1 §3.3 a property containing a
 * syntactically valid `var()` is assumed valid at parse time and only checked after
 * substitution, and a declaration that turns out invalid then is "invalid at computed-value
 * time": the property takes its inherited or initial value rather than the previously cascaded
 * one. So the pair provides nothing, the graphic is still wrong, and crediting it would make
 * this scanner certify a design that goes to air dark. `--accent-glow` is exactly this shape and
 * is read by 73 templates.
 */
function hasFallback(lines: string[], at: number): boolean {
  const prop = declaredProperty(lines[at]);
  if (!prop) return false;
  if (prop.startsWith('--')) return false; // see above: a custom-property pair is not a fallback
  for (let i = at - 1; i >= 0; i -= 1) {
    const prev = lines[i];
    if (!prev.trim()) continue; // blank (or a blanked-out comment) is not a declaration
    if (/[{}]/.test(prev)) return false; // left the rule block without finding one
    const prevProp = declaredProperty(prev);
    if (!prevProp || !coversProperty(prevProp, prop)) return false;
    return !ENGINE_FEATURES.some((f) => f.where === 'css' && f.test.test(prev));
  }
  return false;
}

function scanText(text: string, where: 'css' | 'js'): EngineFinding[] {
  const masked = where === 'css' ? maskCss(text) : maskJs(text);
  const lines = masked.split('\n');
  const found: EngineFinding[] = [];
  for (const feature of ENGINE_FEATURES) {
    if (feature.where !== where) continue;
    for (let i = 0; i < lines.length; i += 1) {
      // Per-line matching, so a report can point at the declaration rather than at the file.
      // The multiline patterns anchor on `^` or a preceding `;`/`{`, both of which survive the
      // split because a declaration never straddles a newline in emitted code.
      const line = lines[i];
      if (!feature.test.test(line)) continue;
      if (where === 'css' && hasFallback(lines, i)) continue;
      found.push({ feature, line: i + 1, source: line.trim().slice(0, 160) });
      break; // one finding per feature per tab: a report names the feature, not every use
    }
  }
  return found;
}

/**
 * Measure the engine a template needs. Scans the CSS, the JS, and any inline `<style>`/`<script>`
 * in the HTML — an imported or hand-edited graphic puts its code there rather than in the tabs.
 */
export function scanEngineSupport(template: SpxTemplate): EngineSupport {
  const inlineStyle = [...template.html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const inlineScript = [...template.html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');
  const findings = [
    ...scanText(`${template.css}\n${inlineStyle}`, 'css'),
    ...scanText(`${template.js}\n${inlineScript}`, 'js'),
  ];
  // De-duplicate: a feature found in both the tab and an inline block is one fact.
  const byFeature = new Map<string, EngineFinding>();
  for (const f of findings) if (!byFeature.has(f.feature.id)) byFeature.set(f.feature.id, f);
  const unique = [...byFeature.values()].sort((a, b) => b.feature.since - a.feature.since);
  return {
    // Cosmetic and shimmed findings are listed but never raise the bar - see EngineFeature.effect.
    minChromium: unique.reduce((max, f) => (raisesTheBar(f.feature.effect) ? Math.max(max, f.feature.since) : max), 0),
    findings: unique,
  };
}

/**
 * Does a finding with this effect decide what engine a template needs? A dropped declaration and
 * a syntax the engine cannot parse do; a typographic nicety and a feature the shipped shim puts
 * back do not. One place answers, so the scanner, the verdicts and the catalog gate
 * (scripts/engine-floor.mjs) cannot disagree.
 */
export function raisesTheBar(effect: EngineFeature['effect']): boolean {
  return effect !== 'cosmetic' && effect !== 'shimmed';
}

export type EngineVerdict = 'fine' | 'degraded' | 'blank';

export interface EngineReport {
  engine: PlayoutEngine;
  verdict: EngineVerdict;
  /** The findings this engine specifically cannot render. */
  missing: EngineFinding[];
}

/**
 * What each engine will actually do with this template.
 *
 * The three verdicts are deliberately not a severity scale — they are three different pictures
 * on air. `blank` (a JS syntax feature the engine cannot parse) means the layer shows NOTHING,
 * which is why it outranks any number of dropped declarations.
 */
export function engineReports(support: EngineSupport): EngineReport[] {
  return PLAYOUT_ENGINES.map((engine) => {
    if (engine.chromium === null) return { engine, verdict: 'fine' as const, missing: [] };
    const missing = support.findings.filter(
      (f) => f.feature.since > engine.chromium! && raisesTheBar(f.feature.effect),
    );
    const verdict: EngineVerdict = missing.length === 0
      ? 'fine'
      : missing.some((f) => f.feature.effect === 'kills-the-file')
        ? 'blank'
        : 'degraded';
    return { engine, verdict, missing };
  });
}

/** The shortest honest headline for a template: "Renders everywhere" or what it needs. */
export function engineHeadline(support: EngineSupport): string {
  if (support.minChromium === 0) return 'Renders on every supported playout engine.';
  const blocked = engineReports(support).filter((r) => r.verdict !== 'fine');
  if (blocked.length === 0) return 'Renders on every supported playout engine.';
  return `Needs a browser engine of Chromium ${support.minChromium} or newer — ${blocked
    .map((r) => r.engine.label)
    .join(', ')} will not render it as designed.`;
}
