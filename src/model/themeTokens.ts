// THE THEME TOKEN CONTRACT — the shape half of the :root style contract.
//
// The colour half already existed: --accent / --text-color / --text-dim / --panel-bg /
// --font-heading / --scale / --type-scale (templates/shared/base.ts rootVarsCss). Everything
// that actually distinguishes the four style families in practice — panel treatment, radius,
// shadow, keyline, accent geometry, the label typeface and its tracking — was a hand-typed
// literal in every variant's CSS, mirrored by eye from the table in DESIGN_LANGUAGE §8.
//
// This file is that table, in code. §8 stays the prose rationale; these are the values.
//
// **Why tokens and not an override block.** A theme has to be re-applicable — the whole point
// of a types × themes catalog is that the same design is emitted in four looks — and an
// appended override block is not idempotent, cannot reach the JS the motion lives in, and
// fights the Style panel over the same declarations. Reading a variable is none of those
// things, and it keeps the generated CSS readable, which is a product pillar.
//
// **Values are complete CSS values, not numbers.** `calc(18px * var(--scale))`, not `18`. That
// is what lets one token cover a scaled length, a percentage and a keyword (`50%`, `999px`,
// `none`) without the consuming rule needing to know which it got.

import { MONO_STACK, type StyleTag } from './fonts';

/** A shadow slot that contributes nothing. `none` cannot be used: these tokens compose into
 *  comma-separated `box-shadow` lists, and `none, none` is not valid CSS. A zero-size
 *  transparent shadow is, and paints nothing. */
export const NO_SHADOW = '0 0 0 0 transparent';

/**
 * The shape tokens. Every one is a CSS value, and every one has a family default below.
 *
 * Deliberately NOT here yet:
 * - **density / padding** — DESIGN_LANGUAGE has no density row, padding is genuinely
 *   per-design (a lower third and an infographic do not share one), and it is the one
 *   designAdjust dimension that has never worked (it reads the auto-fit rule, which has no
 *   padding). It needs measuring before it needs tokenizing.
 * - **the sport skew** — `transform: skewX(0deg)` is not inert: it creates a stacking context
 *   and can change text rasterization, so a "neutral" skew token would not be neutral. It
 *   stays a literal until the render baseline proves otherwise.
 * - **motion feel** — motion lives in the NOACG_ANIM data block in the JS, not in CSS. It
 *   belongs to a theme, but it does not belong in :root.
 */
export interface ThemeTokens {
  /** Panel backdrop treatment. `none`, or a `blur(Npx)`. */
  panelBlur: string;
  /** Panel corner radius. */
  panelRadius: string;
  /** The panel's lift. Pairs with panelKeyline in one box-shadow list. */
  panelShadow: string;
  /** The panel's 1px inner edge, as an inset shadow. */
  panelKeyline: string;
  /** Thickness of the accent bar / rule / slab. */
  accentWeight: string;
  /** The accent element's glow, as a box-shadow. House only, by doctrine. */
  accentGlow: string;
  /** Text colour ON an accent-filled chip — the dark-on-accent ink. */
  accentInk: string;
  /** The label / kicker typeface. The heading font unless the family owns a second face. */
  fontLabel: string;
  /**
   * The typeface LIVE NUMBERS are set in - a clock, a countdown, a score, a tally, a count-up.
   * Unlike every other token here this is not a family opinion: it follows the CHOSEN heading
   * face, resolving to it when that face has tabular figures and to the mono stack when it does
   * not (model/fonts.ts `numericFontStack`). The family default below is the honest starting
   * point; `rootVarsCss` overrides it with the answer for the font actually in use.
   */
  fontNumeric: string;
  /** Label tracking. Small caps breathe; §8 gives the per-family range. */
  labelTracking: string;
  /** Label colour. */
  labelColor: string;
  /** Display/heading weight. */
  displayWeight: string;
  /** Display/heading tracking. Big text tightens; sport opens up and shouts. */
  displayTracking: string;
}

/** The CSS custom-property name a token is emitted as. */
export const TOKEN_VARS: Record<keyof ThemeTokens, string> = {
  panelBlur: '--panel-blur',
  panelRadius: '--panel-radius',
  panelShadow: '--panel-shadow',
  panelKeyline: '--panel-keyline',
  accentWeight: '--accent-weight',
  accentGlow: '--accent-glow',
  accentInk: '--accent-ink',
  fontLabel: '--font-label',
  fontNumeric: '--font-numeric',
  labelTracking: '--label-tracking',
  labelColor: '--label-color',
  displayWeight: '--display-weight',
  displayTracking: '--display-tracking',
};

/** What each token does, emitted as its comment so the generated CSS stays teachable. */
export const TOKEN_COMMENTS: Record<keyof ThemeTokens, string> = {
  panelBlur: 'panel backdrop treatment',
  panelRadius: 'panel corner radius',
  panelShadow: "the panel's lift",
  panelKeyline: "the panel's inner edge",
  accentWeight: 'thickness of the accent bar',
  accentGlow: 'glow on accent elements only',
  accentInk: 'text colour on an accent-filled chip',
  fontLabel: 'the label/kicker typeface',
  fontNumeric: 'the typeface live numbers are set in (equal-width digits)',
  labelTracking: 'label letter-spacing (small caps breathe)',
  labelColor: 'label colour',
  displayWeight: 'heading weight',
  displayTracking: 'heading letter-spacing (big text tightens)',
};

/** The house label face. A design-owned second typeface: the Style panel's heading-font swap
 *  never touches it (DESIGN_LANGUAGE §8), which is why it is a token and not --font-heading.
 *  Same stack `--font-numeric` falls back to, declared once in model/fonts.ts. */
const MONO_LABEL = MONO_STACK;

/**
 * The four families. Values are DESIGN_LANGUAGE §8's, cross-checked against a census of what
 * the 52 catalog stylesheets actually ship — per family AND per element role, because a
 * tracking or a glow means nothing until you know whether it is on the heading, the label or
 * the accent bar. Where the doc and the code disagreed, the note says which won and why.
 *
 * Confidence, from that census — it predicts where the override maps will fill up:
 *
 * - **Strong** (a clear majority ships one value): panelBlur (noacg 6/6 `blur(8px)`, glass
 *   9/10 `blur(18px)`), fontLabel (noacg 8/8 JetBrains Mono), labelColor (minimal 7/11
 *   `--text-dim`, noacg 3/3 `--accent`), displayTracking (minimal 6/19, glass 5/10, sport
 *   5/15 all clear modes), panelRadius for minimal/sport/noacg.
 * - **Weak — expect overrides**: panelShadow is per-design far more than per-family (sport
 *   ships five shadows across five variants, no two alike); glass panelRadius genuinely
 *   ranges 12–18 px, as §8 itself says.
 *
 * Where doc and code diverged:
 * - §8 gives the house chip radius as 6 px. NOTHING in the catalog ships 6 px (bug02's mark
 *   bars are 3 px, lt14 cites the token while shipping neither). Not encoded — a fiction in
 *   the doc should not become a fiction in the code.
 * - §8 gives sport a "hard offset (sticker-slab)" shadow. First encoded as NO_SHADOW (the
 *   flagship slabs sb01/qz01 read no shadow at all), but the full-matrix review found every
 *   sport READER painting its own — a default serving nobody. Now lt07's hard offset, as the
 *   starting point §8 intended; the loud ones (gt03/gt04's sticker stacks, vs01's halo) keep
 *   overriding, and that is intent, not debt (THEME_DEFAULTS_REVIEW).
 * - The minimal keyline is 0.14 in §8, 0.15 in §3, and 0.10/0.18/0.12 in ig06. §8 wins as the
 *   named authority; ig06 carries the difference as a variant override until it is reviewed.
 *
 * And where the census corrected a value read off a single example:
 * - noacg labelTracking is 0.2em (the mode, lt13+lt14), not lt11's 0.22em.
 * - glass displayTracking is -0.01em (5 of 10 uses), not 0.
 *
 * Re-valued by the full-matrix review (2026-07-21, THEME_DEFAULTS_REVIEW.md), which measured
 * every override's direction rather than a single example:
 * - sport labelTracking 0.08em -> 0.14em: all seven sport overrides moved UP from 0.08, none
 *   down — the old value found the right element but the wrong number.
 * - sport displayWeight 700 -> 800: every override climbed (800x3, 900x2); §8's
 *   "condensed/heavy caps" was a floor sport kept climbing off.
 * - sport displayTracking 0.02em -> -0.01em: four of five overrides adopted the other three
 *   families' value; §8's "sport opens up and shouts" is about labels, not display tracking.
 *   All four families now sit at -0.01em — whether this stays a family token is an open
 *   modelling question (ig07's 0.12em shows it already covers two roles).
 */
export const FAMILY_TOKENS: Record<StyleTag, ThemeTokens> = {
  minimal: {
    panelBlur: 'none',
    panelRadius: 'calc(2px * var(--scale))',
    panelShadow: '0 14px 40px rgba(0, 0, 0, 0.30)',
    panelKeyline: 'inset 0 0 0 1px rgba(255, 255, 255, 0.14)',
    accentWeight: 'calc(3px * var(--scale))',
    accentGlow: NO_SHADOW,
    accentInk: 'var(--panel-bg)',
    fontLabel: 'var(--font-heading)',
    fontNumeric: 'var(--font-heading)',
    labelTracking: '0.16em',
    labelColor: 'var(--text-dim)',
    displayWeight: '700',
    displayTracking: '-0.01em',
  },
  sport: {
    panelBlur: 'none',
    panelRadius: '0',
    panelShadow: '0 calc(10px * var(--scale)) 0 rgba(0, 0, 0, 0.25)',
    panelKeyline: NO_SHADOW,
    accentWeight: 'calc(10px * var(--scale))',
    accentGlow: NO_SHADOW,
    accentInk: 'var(--panel-bg)',
    fontLabel: 'var(--font-heading)',
    fontNumeric: 'var(--font-heading)',
    labelTracking: '0.14em',
    labelColor: 'var(--text-color)',
    displayWeight: '800',
    displayTracking: '-0.01em',
  },
  glass: {
    panelBlur: 'blur(18px)',
    panelRadius: 'calc(16px * var(--scale))',
    panelShadow: '0 20px 60px rgba(0, 0, 0, 0.35)',
    panelKeyline: 'inset 0 0 0 1px rgba(255, 255, 255, 0.18)',
    accentWeight: 'calc(4px * var(--scale))',
    accentGlow: NO_SHADOW,
    // The ONE family that cannot express its ink as `var(--panel-bg)`. Every other family panels
    // on a near-black, so its panel colour doubles as the dark ink for text sitting ON an
    // accent fill. A glass panel is `rgba(255,255,255,0.10)` — a translucent WHITE — so
    // `var(--panel-bg)` resolved to 10%-alpha white here and any glass design putting text on
    // an accent chip rendered it invisible (qz03's flooded answer chip, and the guest chip on
    // the host-and-guest strap). An ink also has to be opaque: a translucent one over a
    // coloured chip washes out even when the hue is right.
    accentInk: '#0e1116',
    fontLabel: 'var(--font-heading)',
    fontNumeric: 'var(--font-heading)',
    labelTracking: '0.14em',
    labelColor: 'var(--accent)',
    displayWeight: '700',
    displayTracking: '-0.01em',
  },
  // EDITORIAL — the magazine/newsroom voice. Its structure is RULES, not panels: a hairline
  // above the block, a wide-tracked kicker, a printed-page hierarchy. Values are chosen against
  // minimal, which it is most often confused with: minimal removes, editorial ORGANISES. So the
  // accent is thinner than minimal's (a 2px rule reads as a printed rule, a 3px one as a bar),
  // the label tracking is the widest of the non-cinematic families (0.24em — a masthead kicker),
  // the label takes the ACCENT colour rather than dimming away, and the display weight steps
  // down to 600: an editorial name is set, not shouted.
  editorial: {
    panelBlur: 'none',
    panelRadius: '0',
    panelShadow: '0 12px 36px rgba(0, 0, 0, 0.28)',
    panelKeyline: 'inset 0 0 0 1px rgba(255, 255, 255, 0.10)',
    accentWeight: 'calc(2px * var(--scale))',
    accentGlow: NO_SHADOW,
    accentInk: 'var(--panel-bg)',
    fontLabel: 'var(--font-heading)',
    fontNumeric: 'var(--font-heading)',
    labelTracking: '0.24em',
    labelColor: 'var(--accent)',
    displayWeight: '600',
    displayTracking: '-0.015em',
  },
  // CINEMATIC — the documentary/title-card voice. The one family with NO panel edge: text sits
  // on a soft scrim (each design paints its own gradient) and carries its own shadow, which is
  // why both shadow slots are neutral here rather than "subtle". Two values are deliberately
  // unlike every other family: the accent is a 1px hairline (the thinnest in the set), and the
  // display tracking is POSITIVE — cinema titles open up where broadcast type tightens. The
  // label colour dims rather than accenting: colour is the footage's job in this family.
  cinematic: {
    panelBlur: 'none',
    panelRadius: '0',
    panelShadow: NO_SHADOW,
    panelKeyline: NO_SHADOW,
    accentWeight: 'calc(1px * var(--scale))',
    accentGlow: NO_SHADOW,
    accentInk: 'var(--panel-bg)',
    fontLabel: 'var(--font-heading)',
    fontNumeric: 'var(--font-heading)',
    labelTracking: '0.34em',
    labelColor: 'var(--text-dim)',
    displayWeight: '400',
    displayTracking: '0.06em',
  },
  noacg: {
    panelBlur: 'blur(8px)',
    panelRadius: '0',
    panelShadow: '0 16px 50px rgba(0, 0, 0, 0.5)',
    panelKeyline: NO_SHADOW,
    accentWeight: 'calc(8px * var(--scale))',
    accentGlow: '0 0 calc(22px * var(--scale)) color-mix(in srgb, var(--accent) 60%, transparent)',
    accentInk: 'var(--panel-bg)',
    fontLabel: MONO_LABEL,
    fontNumeric: 'var(--font-heading)',
    labelTracking: '0.2em',
    labelColor: 'var(--accent)',
    displayWeight: '700',
    displayTracking: '-0.01em',
  },
};

/** A variant's or theme's partial override of its family's values. */
export type TokenOverrides = Partial<ThemeTokens>;

/** Family defaults with overrides layered on. The override list is the conformance debt:
 *  every entry is a place a design disagrees with its family, and §8's own rule is "reuse the
 *  exact token values — don't improvise new ones per category". */
export function resolveTokens(family: StyleTag, ...overrides: (TokenOverrides | undefined)[]): ThemeTokens {
  let out = { ...FAMILY_TOKENS[family] };
  for (const o of overrides) if (o) out = { ...out, ...o };
  return out;
}

/**
 * The `:root` lines for the tokens a stylesheet actually reads.
 *
 * Only referenced tokens are emitted, for the same reason an imported design declares no
 * `--type-scale`: a variable nothing consumes is a dead knob, and a dead knob in the style
 * contract is a control that appears to do something and does not.
 */
export function tokenVarsCss(tokens: ThemeTokens, consumerCss: string): string {
  const lines: string[] = [];
  for (const key of Object.keys(TOKEN_VARS) as (keyof ThemeTokens)[]) {
    const name = TOKEN_VARS[key];
    // `var(--x)` and `var(--x, fallback)` both count as reading it. Matching only the first
    // form means a token used WITH a fallback is silently never declared - and then the
    // fallback is what always renders, which looks exactly like the token not working.
    if (!new RegExp(`var\\(\\s*${name}\\s*[,)]`).test(consumerCss)) continue;
    // padEnd aligns the short declarations; the trailing gap keeps a long value (a full
    // box-shadow) from running into its own comment.
    lines.push(`  ${name}: ${tokens[key]};`.padEnd(46) + `  /* ${TOKEN_COMMENTS[key]} */`);
  }
  return lines.join('\n');
}
