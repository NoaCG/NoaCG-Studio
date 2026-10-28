// THE STYLE SURFACE'S WORDS — what each `:root` variable is called where a human edits it.
//
// The style contract is a set of CSS custom properties, and both editing surfaces used to show
// them as their own names with the dashes swapped for spaces: "accent ink", "panel keyline",
// "display tracking". Those are the CSS author's words for them, not the user's, and the
// project's standing rule is that a user-facing name is never CSS jargon
// (docs/TEMPLATE_TAXONOMY_PROPOSAL.md).
//
// This is that translation, in one place, so the wizard and the editor cannot drift. A variable
// with no entry falls back to its own humanised name - a design may declare colours of its own,
// and showing an unknown one honestly beats hiding it.

import { TOKEN_VARS } from './themeTokens';

export interface StyleTermGroup {
  /** The group's heading on the panel. */
  title: string;
  /** Why these belong together, for the group's one-line hint. */
  hint?: string;
}

export interface StyleTerm {
  /** The variable name WITHOUT the leading dashes, as `listCssVariables` reports it. */
  name: string;
  label: string;
  hint?: string;
  group: 'palette' | 'ink' | 'panel' | 'accent' | 'type';
}

export const STYLE_GROUPS: Record<StyleTerm['group'], StyleTermGroup> = {
  palette: { title: 'Colors', hint: 'The four the whole graphic is built from.' },
  ink: { title: 'More colors', hint: "Everything else this design paints with." },
  panel: { title: 'Panel', hint: 'The box behind the text — its shape, edge and lift.' },
  accent: { title: 'Accent', hint: 'The one highlight: how heavy it is and how it glows.' },
  type: { title: 'Type detail', hint: 'Weight and letter-spacing, beyond the size knobs.' },
};

/**
 * The named terms. Order within a group is the order they are shown in.
 *
 * The four palette roles come first and are the ones every design has; the rest are declared
 * only by designs that actually read them (`tokenVarsCss` emits nothing else), which is why
 * a panel renders a control per variable PRESENT rather than per variable known.
 */
export const STYLE_TERMS: StyleTerm[] = [
  { name: 'accent', label: 'Accent', hint: 'the one highlight color', group: 'palette' },
  { name: 'text-color', label: 'Text', hint: 'primary text', group: 'palette' },
  { name: 'text-dim', label: 'Secondary text', hint: 'the quieter line under it', group: 'palette' },
  { name: 'panel-bg', label: 'Panel', hint: 'the box behind the text — transparency works', group: 'palette' },

  { name: 'accent-ink', label: 'Text on accent', hint: 'used where text sits on an accent-filled chip', group: 'ink' },
  { name: 'label-color', label: 'Kicker color', hint: 'the small caps line', group: 'ink' },

  { name: 'panel-radius', label: 'Corner radius', hint: 'square, softened, or a full pill', group: 'panel' },
  { name: 'panel-blur', label: 'Backdrop blur', hint: 'frosts whatever is behind the panel', group: 'panel' },
  { name: 'panel-keyline', label: 'Edge', hint: 'the hairline around the panel', group: 'panel' },
  { name: 'panel-shadow', label: 'Lift', hint: 'the shadow that separates it from the video', group: 'panel' },

  { name: 'accent-weight', label: 'Accent thickness', hint: 'how heavy the bar or rule is', group: 'accent' },
  { name: 'accent-glow', label: 'Accent glow', hint: 'house look; most families use none', group: 'accent' },

  { name: 'display-weight', label: 'Heading weight', group: 'type' },
  { name: 'display-tracking', label: 'Heading letter-spacing', hint: 'big text usually tightens', group: 'type' },
  { name: 'label-tracking', label: 'Kicker letter-spacing', hint: 'small caps need room to breathe', group: 'type' },
  { name: 'font-label', label: 'Kicker typeface', hint: 'the design owns this one; the picker above changes the heading', group: 'type' },
  { name: 'font-numeric', label: 'Numbers typeface', hint: 'live figures — kept to a face whose digits are all one width', group: 'type' },
];

const BY_NAME = new Map(STYLE_TERMS.map((t) => [t.name, t]));

/** The term for a variable, or an honest fallback for one nobody has named. */
export function styleTerm(name: string): StyleTerm {
  return (
    BY_NAME.get(name) ?? {
      name,
      // "brand-primary" -> "Brand primary": readable, and visibly not one of ours.
      label: name.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()),
      group: 'ink',
    }
  );
}

/** The four the Palette section owns, so the generic enumeration never offers them twice. */
export const PALETTE_VARS = new Set(
  STYLE_TERMS.filter((t) => t.group === 'palette').map((t) => t.name),
);

/** Shape tokens, by the name they are emitted as - the set a shape control may edit. */
export const SHAPE_VARS = new Set(Object.values(TOKEN_VARS).map((v) => v.replace(/^--/, '')));

/**
 * The SHADOW-SHAPED tokens get named choices, never a slider or a text box.
 *
 * `--panel-shadow`, `--panel-keyline` and `--accent-glow` are comma-composable box-shadow
 * LISTS whose neutral is a zero-size transparent shadow rather than `none` (themeTokens.ts
 * NO_SHADOW - `none, none` is invalid CSS). Nobody wants to type one of those, and a colour
 * swatch over one edits the wrong thing entirely. Values are the family defaults, so picking
 * one lands a design on something the catalog already ships rather than an invention.
 */
export const SHADOW_CHOICES: Record<string, { label: string; value: string }[]> = {
  'panel-shadow': [
    { label: 'None', value: '0 0 0 0 transparent' },
    { label: 'Soft', value: '0 14px 40px rgba(0, 0, 0, 0.30)' },
    { label: 'Deep', value: '0 20px 60px rgba(0, 0, 0, 0.35)' },
    { label: 'Hard offset', value: '0 calc(10px * var(--scale)) 0 rgba(0, 0, 0, 0.25)' },
  ],
  'panel-keyline': [
    { label: 'None', value: '0 0 0 0 transparent' },
    { label: 'Hairline', value: 'inset 0 0 0 1px rgba(255, 255, 255, 0.10)' },
    { label: 'Visible', value: 'inset 0 0 0 1px rgba(255, 255, 255, 0.18)' },
  ],
  'accent-glow': [
    { label: 'None', value: '0 0 0 0 transparent' },
    { label: 'Glow', value: '0 0 calc(22px * var(--scale)) color-mix(in srgb, var(--accent) 60%, transparent)' },
  ],
};

/**
 * Which tokens carry an editable NUMBER, and the range a slider offers for it.
 *
 * Ranges are the catalog's own span with a little room past it, not arbitrary: a radius runs
 * 0 (sport, editorial, cinematic) to 16 (glass), an accent bar 1 (cinematic) to 10 (sport), and
 * label tracking 0.14 to 0.34 (cinematic). The slider edits the number INSIDE the value's
 * expression (blocks/cssLength.ts), so `calc(16px * var(--scale))` keeps its multiplier and a
 * radius still scales with the graphic.
 *
 * `--panel-blur` is here with an `off` value because its neutral is a keyword, not a zero:
 * `blur(0px)` still creates a backdrop-filter context, and `none` is what the families use.
 */
export const LENGTH_TOKENS: Record<
  string,
  { min: number; max: number; step: number; unit: string; off?: string; on?: string }
> = {
  'panel-radius': { min: 0, max: 64, step: 1, unit: 'px' },
  'accent-weight': { min: 0, max: 24, step: 1, unit: 'px' },
  'panel-blur': { min: 0, max: 40, step: 1, unit: 'px', off: 'none', on: 'blur(8px)' },
  'label-tracking': { min: -0.05, max: 0.4, step: 0.01, unit: 'em' },
  'display-tracking': { min: -0.06, max: 0.15, step: 0.005, unit: 'em' },
};

/** Heading weight is a number too, but a constrained one — a free slider would invite 437. The
 *  Style panel offers only those the heading face really draws (model/fonts.ts `fontWeights`). */
export const WEIGHT_CHOICES = ['400', '500', '600', '700', '800', '900'];

/**
 * The TWO SIZE LADDERS, declared once for both surfaces.
 *
 * They used to be written separately in the wizard and the editor and they disagreed - a
 * graphic sized L in the wizard read as somewhere between M and L when the panel was opened,
 * for no reason anybody could see. The wizard's wider spread is the one that survived: the
 * narrow one produced three near-identical graphics, and the corpus review found production
 * running a far wider size range than we did.
 */
export const SIZE_STEPS: { l: string; s: number }[] = [
  { l: 'S', s: 0.8 },
  { l: 'M', s: 1 },
  // The catalog-wide design-growth cap (DESIGN_LANGUAGE §1) - 1.3 clipped card05's stress test.
  { l: 'L', s: 1.25 },
];

/** Text size rides ON TOP of `--scale`, so its range is tighter: L text on an L graphic must
 *  still sit comfortably inside its panel. */
export const TYPE_SIZE_STEPS: { l: string; s: number }[] = [
  { l: 'S', s: 0.85 },
  { l: 'M', s: 1 },
  { l: 'L', s: 1.2 },
];
