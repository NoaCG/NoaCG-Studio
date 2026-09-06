// WHAT THE LANGUAGE PAINTS WITH - the colour decisions every Phase A graphic shares
// (docs/NOACG_PRO_PLAN.md §15.5, §15.9).
//
// It exists because Phase B made one language render THREE graphics. The surface treatment, the
// brand palette contract, the measured ink and the mark's reading field are the same questions in
// a lower third, a sponsor bug and a countdown, and a second copy of any of them is how two
// graphics in one package come to disagree about the customer's own colours - which is the exact
// failure the coherence claim is about.
//
// Nothing here decides geometry (structure.ts) or markup (the per-graphic composers). It answers
// three questions and no others: what surface the words sit on, which colours are the customer's
// and which are the platform's, and whether the mark can be read on the surface the language
// chose.

import { contrastRatio, parseCssColor } from '../../../model/cssVars';
import { applyLiteBrandPalette, clampLitePalette } from '../../lite/contract';
import type { AssetFile } from '../../../model/types';
import type { Palette } from '../../../model/wizard';
import type { DesignLanguage, LanguagePalette } from './contract';
import { accentPlan, type ResolvedSpacing } from './structure';

/** A brand mark to seat, as the shared slot expects it. `inkLuminance`, `inkSpread` and `backing`
 *  are the content-free facts `probeMark` measures; they are what the mark FIELD decides on. */
export interface ProLogo {
  assetPath: string;
  images: AssetFile[];
  inkLuminance?: number;
  inkSpread?: number;
  backing?: 'transparent' | 'own-field';
}

/**
 * THE REQUESTED BRAND PALETTE - identity verbatim, furniture legible.
 *
 * RATIFIED ON LITE 2026-08-13 AND MISSING FROM PRO UNTIL 2026-08-15 (`docs/AI_LITE_BRAND_PLAN.md`
 * §3.1, `src/ai/AGENTS.md`). When the customer states their colours, those colours ARE the
 * graphic's: the model gets no vote on them, because "exactly the brand's colours" is the whole
 * product claim and it can fail three silent ways through a model echo - a near-miss hex, an
 * omitted palette that lets a default carry, and a legibility repair deleting the package.
 *
 * Pro asked the model to return the palette and stated the brand in PROSE (`pro/brief.ts`
 * `proBrandSection`), which is a decision expressed where nothing can check it. The prompt still
 * describes the brand - a language decision needs to know what world it is in - but the platform
 * now copies the identity over whatever came back, and RECORDS the divergence.
 *
 * What that changes about the record: the §15.8 round's 26-of-30 blind read measured the PROSE
 * version, so it says nothing about how faithfully a stated palette now lands.
 */
export type BrandPalette = LanguagePalette;

export interface ResolvedPalette {
  /** The four roles, after identity is copied and furniture is repaired. */
  palette: LanguagePalette;
  /** Every divergence from what was asked for, in Lite's own adjustment vocabulary. */
  adjustments: string[];
}

/**
 * The colours this graphic is actually drawn in.
 *
 * With no requested brand this is exactly what Phase A always did - the model's four roles with
 * the furniture brought up to the contrast floor against its own panel. With one, the identity
 * (accent and panel) is the REQUEST's, taken verbatim, and the furniture goes through the same
 * ladder. `applyLiteBrandPalette` is imported rather than re-implemented for the reason a second
 * legibility ladder is always wrong: two answers that can disagree about one customer's colours.
 */
/**
 * PRO'S OWN FLOOR PAIR, and the reason it is not `LITE_CONTRAST_FLOOR`.
 *
 * The ladder is shared - one implementation, because two would be two answers about one
 * customer's colours - but the NUMBERS are not: Lite and Pro are separate projects that do not
 * share a quality bar (`src/ai/AGENTS.md`), so a floor ratified on one tier's corpus is not
 * evidence for the other's.
 *
 * The secondary rung is the owner's 3.25:1, ratified 2026-08-20 (docs/NOACG_PRO_PLAN.md §25.8.2).
 * Lite's 3 is WCAG's large-text floor, and re-judging the paid Pro corpus against it is what
 * showed 3 to be the wrong number HERE: the supporting line the owner named on S-03 measured
 * **3.04:1** and cleared it by four hundredths. The primary rung is unchanged - nothing measured
 * says otherwise, and moving a floor no evidence names is how a threshold stops meaning anything.
 */
const PRO_CONTRAST_FLOOR = { primary: 4.5, secondary: 3.25 } as const;

export function resolvePalette(
  language: DesignLanguage,
  brand?: BrandPalette | null,
): ResolvedPalette {
  if (!brand) return clampLitePalette(language.palette, PRO_CONTRAST_FLOOR);
  return applyLiteBrandPalette(brand, language.palette, PRO_CONTRAST_FLOOR);
}

/**
 * The ink that READS on a surface - white or black, whichever measures better.
 *
 * The block accent form used to print the supporting line in `var(--panel-bg)`, on the reasoning
 * that the panel's own colour would look deliberate against the accent. It does not measure:
 * the owner's blind read named it twice on the two graphics that used the form (*"black text on
 * an orange background is not so good"*), and a dark plum on a bright orange is exactly the pair
 * that argument produces. The panel colour is a DESIGN answer to a LEGIBILITY question, which is
 * the class of decision the platform exists to take off the model.
 */
export function readableInkOn(surface: string): string {
  const bg = parseCssColor(surface);
  if (!bg) return '#000000';
  const white = parseCssColor('#ffffff');
  const black = parseCssColor('#000000');
  if (!white || !black) return '#000000';
  return contrastRatio(white, bg) >= contrastRatio(black, bg) ? '#ffffff' : '#000000';
}

/** #rrggbb plus an alpha, as an rgba() a decade-old CasparCG build still parses. No color-mix:
 *  the auto-fit cap next door carries a comment about exactly this, and a panel that silently
 *  drops its background on an old engine is a graphic nobody can read. */
export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export interface PanelSurface {
  value: string;
  blur: boolean;
  note: string;
}

/** The surface the words sit on, per the language's panel treatment. One answer for the whole
 *  package: a bug drawn on a solid tile beside a strap drawn on a blurred one is two designs. */
export function panelSurface(language: DesignLanguage, palette: LanguagePalette): PanelSurface {
  switch (language.shape.panel) {
    case 'solid':
      return { value: palette.panel, blur: false, note: 'a solid surface' };
    case 'translucent':
      return { value: rgba(palette.panel, 0.82), blur: false, note: 'a translucent surface' };
    case 'none':
      return { value: 'transparent', blur: false, note: 'no surface - the words sit on the picture' };
    case 'blurred':
    default:
      return { value: rgba(palette.panel, 0.72), blur: true, note: 'a blurred surface' };
  }
}

/** The wizard `Palette` the `:root` contract is written from. The surface carries the treatment's
 *  own alpha, so the Style panel retints the graphic the language actually drew. */
export function wizardPalette(
  language: DesignLanguage,
  palette: LanguagePalette,
  surface: string,
): Palette {
  return {
    id: 'pro-language',
    name: language.name,
    styleTags: ['noacg'],
    accent: palette.accent,
    text: palette.text,
    textDim: palette.textDim,
    panel: surface,
  };
}

/** The same 3:1 the rendered mark gate and the Lite brand audit both measure against. */
const MARK_INK_CONTRAST_FLOOR = 3;
/**
 * How far a mark's ink may spread and still count as ONE ink (`MarkProbe.inkSpread`).
 *
 * MEASURED over the four fixture marks rather than chosen: the two single-ink marks - a volt
 * wordmark and a navy monogram, hues as far apart as the set holds - come in at 0.0021 and
 * 0.0004, and the full-colour roundel at 0.2053. Two orders of magnitude, so this floor sits 24x
 * above the loosest single ink and 4x below the coloured mark, and no plausible drift crosses it.
 *
 * This is the whole reason the field can be trusted. A mean luminance flagged three marks in the
 * Phase A round and the owner's eye agreed with one; the spread is what separates the mark that
 * genuinely vanishes from the one that merely measures badly.
 */
const MARK_SINGLE_INK_SPREAD = 0.05;

/** A colour's relative luminance, read back out of the one contrast function this repo has.
 *  contrast(c, black) = (L + 0.05) / 0.05, so L falls straight out of it - which is cheaper and
 *  safer than a second copy of the luminance formula. */
function luminanceOf(color: string): number | null {
  const parsed = parseCssColor(color);
  const black = parseCssColor('#000000');
  if (!parsed || !black) return null;
  return contrastRatio(parsed, black) * 0.05 - 0.05;
}

function contrastFromLuminance(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * What the platform does about a mark that cannot be read on the surface it chose.
 *
 * `knock` recolours a SINGLE-INK mark to the one ink that reads; `none` leaves it exactly as
 * uploaded. **There is deliberately no plate.** The owner's ruling of 2026-08-16, after reading
 * the first accepted Pro set (docs/NOACG_PRO_PLAN.md §17): *try the ink knock first for single-ink
 * marks, do not automatically plate them; a full-colour mark keeps its colours and is served by a
 * well the DESIGN provides, never by the platform painting a generic repair field.*
 *
 * The read that produced it is worth keeping beside the rule, because it is subtler than "no
 * boxes": lt07's blue block and ls10's red block were both LIKED. A well a design draws is part
 * of the composition; a neutral field the platform paints around the artwork is a patch, and it
 * reads as one.
 */
export type MarkTreatment =
  | { kind: 'knock'; ink: string; filter: string; reason: string }
  | { kind: 'none'; reason: string | null };

/** The two inks a knock can produce, and the only two it should: a single-ink mark supplied for
 *  broadcast is a mono knockout, and `brightness(0)` collapses any one ink to black exactly.
 *  Hitting an arbitrary hex through a filter chain is approximate; these two are not. */
const KNOCK_WHITE = { ink: '#ffffff', filter: 'brightness(0) invert(1)', luminance: 1 };
const KNOCK_BLACK = { ink: '#000000', filter: 'brightness(0)', luminance: 0 };

/**
 * The treatment the mark needs, or `none` when it already reads.
 *
 * Deciding this needs nothing from the layout - only the mark's measured ink and the surface the
 * language chose - so it is deterministic, it is here, and it is the SAME answer on every graphic
 * type in the package. A mark that brings its own field reads on anything and is left alone.
 *
 * **A knock that cannot clear the floor is not applied.** The chain the ruling names is knock,
 * then a design-supported alternate placement, then nothing - and the composed Pro graphic draws
 * no second placement today, so the third rung is reached by leaving the mark alone and SAYING
 * so. Recolouring a customer's mark to something that still cannot be read would spend the
 * alteration and buy nothing.
 */
export function markTreatmentFor(surface: string, logo: ProLogo): MarkTreatment {
  if (logo.backing === 'own-field' || typeof logo.inkLuminance !== 'number') {
    return { kind: 'none', reason: null };
  }
  // ONE INK, OR NOTHING. A coloured mark reads by hue and shape, not by the mean luminance the
  // contrast test measures, and knocking it to a single ink would DESTROY it - the identity is
  // the colour. Those are the design's to serve with a well of its own. An older probe with no
  // spread at all is treated as "cannot tell", and cannot tell means do not touch it.
  if (typeof logo.inkSpread !== 'number' || logo.inkSpread > MARK_SINGLE_INK_SPREAD) {
    return { kind: 'none', reason: null };
  }
  const panel = luminanceOf(surface);
  if (panel === null) return { kind: 'none', reason: null };   // a panel-free super paints no surface to fail against
  const onPanel = contrastFromLuminance(logo.inkLuminance, panel);
  if (onPanel >= MARK_INK_CONTRAST_FLOOR) return { kind: 'none', reason: null };

  // WHICH ink, by measurement rather than by assuming a dark mark wants white: the panel decides.
  const white = contrastFromLuminance(KNOCK_WHITE.luminance, panel);
  const black = contrastFromLuminance(KNOCK_BLACK.luminance, panel);
  const better = white >= black
    ? { ...KNOCK_WHITE, ratio: white }
    : { ...KNOCK_BLACK, ratio: black };
  if (better.ratio < MARK_INK_CONTRAST_FLOOR) {
    return {
      kind: 'none',
      reason: `the mark reads ${onPanel.toFixed(2)}:1 on this panel (floor ${MARK_INK_CONTRAST_FLOOR})`
        + ` and no knock clears it either (${better.ratio.toFixed(2)}:1 at best), so the mark is left`
        + ' exactly as supplied - this design offers no second placement for it',
    };
  }
  return {
    kind: 'knock',
    ink: better.ink,
    filter: better.filter,
    reason: `the mark reads ${onPanel.toFixed(2)}:1 on this panel (floor ${MARK_INK_CONTRAST_FLOOR})`
      + ` - its single ink is knocked to ${better.ink}, where it reads ${better.ratio.toFixed(2)}:1`
      + ' on the panel itself, with no field behind it',
  };
}

/**
 * The knock, as CSS on the mark itself - no surface, no padding, no box.
 *
 * `brightness(0)` collapses every non-transparent pixel of a single-ink mark to black and
 * `invert(1)` lifts that to white; alpha, aspect and geometry are untouched, which is what makes
 * this a RECOLOUR rather than the kind of alteration the as-is screen exists to refuse. The mark
 * still sits on the panel the design chose - the whole point of the ruling.
 *
 * THE CLASS IS THE CONTRACT. `assetIntegrity.ts` admits a filter on a protected picture only on
 * this selector and only in this exact shape, so every other filter anywhere - including a blur
 * on this same element - is still the blocking error it was. Change the emit here and that
 * allowance stops matching, which is the failure mode worth having.
 */
export function markKnockCss(prefix: string, knock: MarkTreatment & { kind: 'knock' }): string {
  return `
/* == PLATFORM: ${knock.reason}. == */
.${prefix}-box > .${prefix}-logo.${prefix}-logo--knocked {
  filter: ${knock.filter};  /* the mark's one ink, recoloured to read - nothing else is touched */
}`;
}

/**
 * DOES THE PACKAGE SURVIVE THE PICTURE? - measured at compose time, where the answer is exact.
 *
 * §17.2: the owner read `minimalist.ledger` (`panel: none`) as unreadable over a busy plate while
 * every gate passed it, because `BROADCAST_BACKDROP` is a single near-black card and a near-white
 * super measures 14:1 against it. `validation/plateLegibility.ts` asks the same question of an
 * arbitrary rendered graphic and has to INFER the surface from the DOM, which under-detects a
 * panel drawn as a positioned sibling.
 *
 * **Here nothing is inferred.** The composer chose the surface, so it can compose the language's
 * own ink over its own surface over each plate and report the truth. That is the whole argument
 * for the platform owning the composition, arriving on a legibility question.
 */
export function platePlan(
  language: DesignLanguage,
  palette: LanguagePalette,
  surface: PanelSurface,
  spacing: ResolvedSpacing,
): { role: string; ink: string; worst: { plate: string; ratio: number }; floor: number }[] {
  const panel = parseCssColor(surface.value);
  const roles: { role: string; ink: string; px: number; bold: boolean }[] = [
    { role: 'the heading', ink: palette.text, px: spacing.headingPx, bold: true },
    { role: 'the supporting line', ink: palette.textDim, px: spacing.supportingPx, bold: false },
  ];
  const out = [];
  for (const { role, ink, px, bold } of roles) {
    const fg = parseCssColor(ink);
    if (!fg) continue;
    const floor = px >= 24 || (bold && px >= 18.66) ? 3 : 4.5;
    const ratios = PLATE_COLORS.map(({ id, value }) => {
      const plate = parseCssColor(value);
      if (!plate) return { plate: id, ratio: 21 };
      // The design's own surface composited over the plate - transparent panels fold to the
      // plate itself, translucent ones to exactly the mix the browser will paint.
      const under = !panel || panel.a <= 0
        ? plate
        : {
          r: panel.r * panel.a + plate.r * (1 - panel.a),
          g: panel.g * panel.a + plate.g * (1 - panel.a),
          b: panel.b * panel.a + plate.b * (1 - panel.a),
          a: 1,
          form: 'rgb' as const,
        };
      return { plate: id, ratio: contrastRatio(fg, under, under) };
    });
    const worst = ratios.reduce((a, b) => (b.ratio < a.ratio ? b : a));
    // THE PICTURE HAS TO BE WHAT MAKES THE DIFFERENCE, or this is the wrong instrument speaking:
    // ink that misses the floor on every plate is too close to the language's own surface, which
    // is the ordinary contrast question. Same rule, same reason, as
    // `validation/plateLegibility.ts` - stated in both because they are read separately.
    if (ratios.every((r) => r.ratio < floor)) continue;
    // ANY plate under the floor is reported, and the first version of this got it wrong in a way
    // worth keeping. It required TWO, reasoning that one failure is an extreme a designer may
    // knowingly accept - calibrated on the catalog, where failures cluster on the blown-out
    // plate. **It then silenced the exact graphic this instrument was built for.**
    // `minimalist.ledger` sets a MID-GREY supporting line (#8a8a85): 5.7:1 on the night
    // exterior, 3.2:1 on the blown-out sky, and 1.14:1 in the middle - it fails the MIDDLE and
    // passes both extremes, which is precisely the shape a single dark stand-in can never see.
    // One plate is a class of footage the graphic will meet. The finding names which.
    if (worst.ratio >= floor) continue;
    out.push({ role: `${role} (${language.name})`, ink, worst, floor });
  }
  return out;
}

/** The three plates `validation/plateLegibility.ts` measures against, as CSS values - one list,
 *  so a number computed at compose time and a number measured on a rendered frame cannot drift. */
const PLATE_COLORS = [
  { id: 'a night exterior', value: 'rgb(8, 9, 12)' },
  { id: 'a mid-tone shot', value: 'rgb(128, 128, 128)' },
  { id: 'a blown-out sky', value: 'rgb(244, 246, 248)' },
];

/**
 * WHAT THE PLATFORM DECIDED, said out loud - the same four sentences for every graphic in the
 * package, plus whatever it had to repair.
 *
 * One writer for all three types, because these notes are what the result card shows and what
 * `gate.ts` re-reads for the `pro-mark-knocked` finding; two writers is how the note and the
 * finding come to state different numbers about the same alteration.
 */
export function platformNotes(input: {
  language: DesignLanguage;
  spacing: ResolvedSpacing;
  surface: PanelSurface;
  /** The class prefix, for the accent note's honest caveat. */
  prefix: string;
  adjustments: string[];
  mark: MarkTreatment;
  /** What `platePlan` found, when the caller ran it. */
  plates?: { role: string; worst: { plate: string; ratio: number }; floor: number }[];
}): string[] {
  const { language, spacing, surface, prefix, adjustments, mark } = input;
  const plan = accentPlan(language.accent.form);
  const notes = [
    `structure and spacing: platform-owned (${language.density} density -`
    + ` ${spacing.padVPx}/${spacing.padHPx}px padding, ${spacing.lineGapPx}px line gap, at scale 1)`,
    `accent: ${plan.note}`,
    `surface: ${surface.note}`,
    `motion: ${language.motion.character} at ${language.motion.pace} pace → preset ${spacing.preset}`,
  ];
  if (!plan.element && language.accent.form !== 'none') {
    notes.push(`the accent is drawn without a .${prefix}-accent element, so the entrance`
      + ' animates the panel and its lines rather than a separate shape');
  }
  if (adjustments.length) notes.push(`palette furniture repaired: ${adjustments.join(', ')}`);
  // Said out loud in BOTH directions: a knock is an alteration to a customer's artwork and a
  // refusal to knock is a mark left unreadable. Neither may be silent.
  if (mark.kind === 'knock') notes.push(`mark ink knocked: ${mark.reason}`);
  else if (mark.reason) notes.push(`mark left as supplied: ${mark.reason}`);
  for (const plate of input.plates ?? []) {
    notes.push(`over the picture: ${plate.role} reads ${plate.worst.ratio}:1 over`
      + ` ${plate.worst.plate} (floor ${plate.floor}) - this graphic depends on the shot being kind`);
  }
  return notes;
}
